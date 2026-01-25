#!/bin/bash
#
# Clawdbot Installer - Fully Automated
# Provisions an Orgo VM, installs Clawdbot, configures channels, and starts the gateway
#
# Usage: ./install-clawdbot.sh [--env-file .env]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Orgo API base URL
ORGO_API="https://www.orgo.ai/api"

# Load .env file if provided or exists
ENV_FILE=".env"
if [[ "$1" == "--env-file" ]] && [[ -n "$2" ]]; then
    ENV_FILE="$2"
fi

if [[ -f "$ENV_FILE" ]]; then
    log_info "Loading environment from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
else
    log_error "Environment file not found: $ENV_FILE"
    log_error "Copy .env.example to .env and fill in your values"
    exit 1
fi

# Validate required environment variables
if [[ -z "$ORGO_API_KEY" ]]; then
    log_error "ORGO_API_KEY is required"
    exit 1
fi

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
    log_error "ANTHROPIC_API_KEY is required"
    exit 1
fi

# Check for required tools
if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed. Install with: brew install jq"
    exit 1
fi

# Set defaults
PROJECT_NAME="${PROJECT_NAME:-clawdbot-project}"
COMPUTER_NAME="${COMPUTER_NAME:-clawdbot-vm}"
VM_RAM="${VM_RAM:-4}"
VM_CPU="${VM_CPU:-2}"

echo ""
log_info "============================================"
log_info "Clawdbot Installer"
log_info "============================================"
log_info "Project: $PROJECT_NAME"
log_info "Computer: $COMPUTER_NAME"
log_info "VM: ${VM_RAM}GB RAM, ${VM_CPU} CPU cores"
log_info "============================================"
echo ""

# Helper function for Orgo API calls
orgo_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    if [[ -n "$data" ]]; then
        curl -s -X "$method" "${ORGO_API}${endpoint}" \
            -H "Authorization: Bearer $ORGO_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X "$method" "${ORGO_API}${endpoint}" \
            -H "Authorization: Bearer $ORGO_API_KEY" \
            -H "Content-Type: application/json"
    fi
}

# Helper function to run bash on VM
run_on_vm() {
    local computer_id="$1"
    local command="$2"
    local show_output="${3:-false}"

    if [[ "$show_output" == "true" ]]; then
        log_info "Running: $command"
    else
        log_info "Running: ${command:0:80}..."
    fi

    local result=$(orgo_api "POST" "/computers/${computer_id}/bash" "{\"command\": $(echo "$command" | jq -Rs .)}")

    # Check for errors
    if echo "$result" | jq -e '.error' > /dev/null 2>&1; then
        local error_msg=$(echo "$result" | jq -r '.error')
        log_error "Command failed: $error_msg"
        return 1
    fi

    local output=$(echo "$result" | jq -r '.output // .stdout // .' 2>/dev/null || echo "$result")

    if [[ "$show_output" == "true" ]] && [[ -n "$output" ]]; then
        echo "$output"
    fi

    echo "$output"
}

# ============================================================================
# STEP 1: Create or get project
# ============================================================================

log_info "Step 1: Setting up Orgo project..."

# List projects to find existing or create new
PROJECTS_RESULT=$(orgo_api "GET" "/projects")
PROJECT_ID=$(echo "$PROJECTS_RESULT" | jq -r ".projects[] | select(.name==\"$PROJECT_NAME\") | .id")

if [[ -z "$PROJECT_ID" ]]; then
    log_info "Creating new project: $PROJECT_NAME"
    PROJECT_RESULT=$(orgo_api "POST" "/projects" "{\"name\": \"$PROJECT_NAME\"}")
    PROJECT_ID=$(echo "$PROJECT_RESULT" | jq -r '.id // empty')

    if [[ -z "$PROJECT_ID" ]]; then
        log_error "Failed to create project"
        log_error "Response: $PROJECT_RESULT"
        exit 1
    fi
    log_success "Created project: $PROJECT_NAME (ID: $PROJECT_ID)"
else
    log_success "Found existing project: $PROJECT_NAME (ID: $PROJECT_ID)"
fi

# ============================================================================
# STEP 2: Create or find computer
# ============================================================================

log_info "Step 2: Setting up Orgo VM..."

# Check if computer already exists
PROJECT_DATA=$(orgo_api "GET" "/projects/${PROJECT_ID}")
EXISTING_COMPUTER=$(echo "$PROJECT_DATA" | jq -r ".desktops[] | select(.name==\"$COMPUTER_NAME\")")
COMPUTER_ID=$(echo "$EXISTING_COMPUTER" | jq -r '.id // empty')

if [[ -n "$COMPUTER_ID" ]]; then
    log_success "Found existing computer: $COMPUTER_NAME (ID: $COMPUTER_ID)"
    EXISTING_STATUS=$(echo "$EXISTING_COMPUTER" | jq -r '.status // empty')
    log_info "Status: $EXISTING_STATUS"
else
    log_info "Creating new computer: $COMPUTER_NAME"
    COMPUTER_RESULT=$(orgo_api "POST" "/computers" "{
        \"project_id\": \"$PROJECT_ID\",
        \"name\": \"$COMPUTER_NAME\",
        \"os\": \"linux\",
        \"ram\": $VM_RAM,
        \"cpu\": $VM_CPU
    }")

    # Extract computer ID
    COMPUTER_ID=$(echo "$COMPUTER_RESULT" | jq -r '.id // empty')

    if [[ -z "$COMPUTER_ID" ]]; then
        log_error "Failed to create computer"
        log_error "Response: $COMPUTER_RESULT"
        exit 1
    fi

    log_success "Created computer: $COMPUTER_NAME (ID: $COMPUTER_ID)"
fi
log_info "Computer ID: $COMPUTER_ID"

# ============================================================================
# STEP 3: Wait for VM to be ready
# ============================================================================

log_info "Step 3: Waiting for VM to be ready..."

for i in {1..30}; do
    # Get status from project endpoint (computers are in desktops array)
    PROJECT_DATA=$(orgo_api "GET" "/projects/${PROJECT_ID}")
    STATUS=$(echo "$PROJECT_DATA" | jq -r ".desktops[] | select(.id==\"$COMPUTER_ID\") | .status // empty")

    if [[ "$STATUS" == "running" ]]; then
        log_success "VM is running!"
        break
    fi

    if [[ $i -eq 30 ]]; then
        log_error "Timeout waiting for VM to start"
        log_error "Last status: $STATUS"
        exit 1
    fi

    echo -n "."
    sleep 2
done
echo ""

# Give it a moment to fully initialize
sleep 3

# ============================================================================
# STEP 4: Install Node.js and Clawdbot
# ============================================================================

log_info "Step 4: Installing Node.js and Clawdbot..."

# Update system
log_info "Updating system packages..."
run_on_vm "$COMPUTER_ID" "sudo apt-get update -qq" > /dev/null

# Install dependencies
log_info "Installing dependencies..."
run_on_vm "$COMPUTER_ID" "sudo apt-get install -y git curl" > /dev/null

# Install NVM
log_info "Installing NVM..."
run_on_vm "$COMPUTER_ID" "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash" > /dev/null

# Install Node.js 22
log_info "Installing Node.js 22..."
run_on_vm "$COMPUTER_ID" 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22' > /dev/null

# Verify Node.js
log_info "Verifying Node.js..."
NODE_VERSION=$(run_on_vm "$COMPUTER_ID" 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && node -v')
log_success "Node.js installed: $NODE_VERSION"

# Install Clawdbot
log_info "Installing Clawdbot (this may take a minute)..."
run_on_vm "$COMPUTER_ID" 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && npm install -g clawdbot@latest' > /dev/null

# Verify Clawdbot (check if binary exists - version check can timeout)
log_info "Verifying Clawdbot..."
CLAWDBOT_PATH=$(run_on_vm "$COMPUTER_ID" 'ls ~/.nvm/versions/node/*/bin/clawdbot 2>/dev/null | head -1')
if [[ -n "$CLAWDBOT_PATH" ]] && [[ "$CLAWDBOT_PATH" != *"No such file"* ]]; then
    log_success "Clawdbot installed at: $CLAWDBOT_PATH"
else
    log_error "Clawdbot installation failed"
    exit 1
fi

# ============================================================================
# STEP 5: Configure Clawdbot
# ============================================================================

log_info "Step 5: Configuring Clawdbot..."

# Create directories
run_on_vm "$COMPUTER_ID" "mkdir -p ~/.clawdbot /home/user/clawd" > /dev/null

# Build channels configuration
TELEGRAM_CONFIG=""
if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
    TELEGRAM_ALLOWFROM=""
    if [[ -n "$TELEGRAM_USER_ID" ]]; then
        TELEGRAM_ALLOWFROM="\"allowFrom\": [\"$TELEGRAM_USER_ID\"],"
    fi
    TELEGRAM_CONFIG="\"telegram\": {
      \"enabled\": true,
      \"botToken\": \"$TELEGRAM_BOT_TOKEN\",
      \"dmPolicy\": \"allowlist\",
      $TELEGRAM_ALLOWFROM
      \"groupPolicy\": \"allowlist\"
    }"
    log_info "Telegram channel configured"
fi

DISCORD_CONFIG=""
if [[ -n "$DISCORD_BOT_TOKEN" ]]; then
    DISCORD_CONFIG="\"discord\": {
      \"enabled\": true,
      \"token\": \"$DISCORD_BOT_TOKEN\",
      \"groupPolicy\": \"allowlist\",
      \"dm\": {
        \"enabled\": true,
        \"policy\": \"pairing\"
      }
    }"
    log_info "Discord channel configured"
fi

# Combine channels
CHANNELS=""
if [[ -n "$TELEGRAM_CONFIG" ]] && [[ -n "$DISCORD_CONFIG" ]]; then
    CHANNELS="$TELEGRAM_CONFIG, $DISCORD_CONFIG"
elif [[ -n "$TELEGRAM_CONFIG" ]]; then
    CHANNELS="$TELEGRAM_CONFIG"
elif [[ -n "$DISCORD_CONFIG" ]]; then
    CHANNELS="$DISCORD_CONFIG"
fi

# Build plugins configuration
TELEGRAM_PLUGIN=""
if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
    TELEGRAM_PLUGIN="\"telegram\": {\"enabled\": true}"
fi

DISCORD_PLUGIN=""
if [[ -n "$DISCORD_BOT_TOKEN" ]]; then
    DISCORD_PLUGIN="\"discord\": {\"enabled\": true}"
fi

PLUGINS=""
if [[ -n "$TELEGRAM_PLUGIN" ]] && [[ -n "$DISCORD_PLUGIN" ]]; then
    PLUGINS="$TELEGRAM_PLUGIN, $DISCORD_PLUGIN"
elif [[ -n "$TELEGRAM_PLUGIN" ]]; then
    PLUGINS="$TELEGRAM_PLUGIN"
elif [[ -n "$DISCORD_PLUGIN" ]]; then
    PLUGINS="$DISCORD_PLUGIN"
fi

# Generate a random gateway token
GATEWAY_TOKEN=$(openssl rand -hex 24)

# Create config JSON
CONFIG_JSON=$(cat << CONFIGEOF
{
  "meta": {
    "lastTouchedVersion": "2026.1.22"
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "api_key"
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/user/clawd",
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "channels": {
    $CHANNELS
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "$GATEWAY_TOKEN"
    }
  },
  "plugins": {
    "entries": {
      $PLUGINS
    }
  }
}
CONFIGEOF
)

# Write config to VM using Python to avoid escaping issues
log_info "Writing Clawdbot configuration..."
CONFIG_B64=$(echo "$CONFIG_JSON" | base64)
run_on_vm "$COMPUTER_ID" "echo '$CONFIG_B64' | base64 -d > ~/.clawdbot/clawdbot.json" > /dev/null

log_success "Clawdbot configured!"

# ============================================================================
# STEP 6: Add environment to bashrc
# ============================================================================

log_info "Step 6: Setting up environment..."

# Create startup environment
BASHRC_ADDITIONS="
# Clawdbot configuration
export NVM_DIR=\"\\\$HOME/.nvm\"
[ -s \"\\\$NVM_DIR/nvm.sh\" ] && . \"\\\$NVM_DIR/nvm.sh\"
export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'"

if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
    BASHRC_ADDITIONS="$BASHRC_ADDITIONS
export TELEGRAM_BOT_TOKEN='$TELEGRAM_BOT_TOKEN'"
fi

if [[ -n "$DISCORD_BOT_TOKEN" ]]; then
    BASHRC_ADDITIONS="$BASHRC_ADDITIONS
export DISCORD_BOT_TOKEN='$DISCORD_BOT_TOKEN'"
fi

run_on_vm "$COMPUTER_ID" "cat >> ~/.bashrc << 'BASHEOF'
$BASHRC_ADDITIONS
BASHEOF" > /dev/null

log_success "Environment configured!"

# ============================================================================
# STEP 7: Start the gateway
# ============================================================================

log_info "Step 7: Starting Clawdbot gateway..."

# Create a startup script on the VM
STARTUP_SCRIPT='#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export ANTHROPIC_API_KEY="'"$ANTHROPIC_API_KEY"'"'

if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
    STARTUP_SCRIPT="$STARTUP_SCRIPT"'
export TELEGRAM_BOT_TOKEN="'"$TELEGRAM_BOT_TOKEN"'"'
fi

if [[ -n "$DISCORD_BOT_TOKEN" ]]; then
    STARTUP_SCRIPT="$STARTUP_SCRIPT"'
export DISCORD_BOT_TOKEN="'"$DISCORD_BOT_TOKEN"'"'
fi

STARTUP_SCRIPT="$STARTUP_SCRIPT"'
clawdbot gateway run'

# Write and run startup script
SCRIPT_B64=$(echo "$STARTUP_SCRIPT" | base64)
run_on_vm "$COMPUTER_ID" "echo '$SCRIPT_B64' | base64 -d > /tmp/start-clawdbot.sh && chmod +x /tmp/start-clawdbot.sh" > /dev/null
run_on_vm "$COMPUTER_ID" "nohup /tmp/start-clawdbot.sh > /tmp/clawdbot.log 2>&1 &" > /dev/null

# Wait a moment for startup
sleep 5

# Check if gateway is running
GATEWAY_CHECK=$(run_on_vm "$COMPUTER_ID" "pgrep -f 'clawdbot gateway' > /dev/null && echo 'RUNNING' || echo 'NOT_RUNNING'")

if echo "$GATEWAY_CHECK" | grep -q "RUNNING"; then
    log_success "Clawdbot gateway is running!"
else
    log_warn "Gateway may still be starting. Checking logs..."
    run_on_vm "$COMPUTER_ID" "tail -20 /tmp/clawdbot.log" "true"
fi

# ============================================================================
# COMPLETE
# ============================================================================

echo ""
log_success "============================================"
log_success "INSTALLATION COMPLETE!"
log_success "============================================"
echo ""
log_info "Computer ID: $COMPUTER_ID"
log_info "Project: $PROJECT_NAME"

# Get VM URL
VM_INFO=$(orgo_api "GET" "/computers/${COMPUTER_ID}")
VM_URL=$(echo "$VM_INFO" | jq -r '.url // empty')
if [[ -n "$VM_URL" ]]; then
    log_info "VM URL: $VM_URL"
fi

echo ""

if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
    echo -e "${GREEN}TELEGRAM SETUP:${NC}"
    echo "  1. Find your bot on Telegram"
    echo "  2. Send /start or any message"
    if [[ -n "$TELEGRAM_USER_ID" ]]; then
        echo "  3. You're already in the allowlist (ID: $TELEGRAM_USER_ID)"
        echo "     Messages should work immediately!"
    else
        echo "  3. You'll receive a pairing code"
        echo "  4. Approve via Orgo bash: clawdbot pairing approve telegram <CODE>"
    fi
    echo ""
fi

if [[ -n "$DISCORD_BOT_TOKEN" ]]; then
    echo -e "${GREEN}DISCORD SETUP:${NC}"
    echo "  1. Invite your bot to a server"
    echo "  2. DM the bot or mention it"
    echo "  3. Complete pairing if required"
    echo ""
fi

echo -e "${BLUE}USEFUL COMMANDS (run via Orgo):${NC}"
echo "  Check logs:    cat /tmp/clawdbot.log"
echo "  Check status:  pgrep -f 'clawdbot gateway'"
echo "  Check port:    netstat -tlnp | grep 18789  (or: ss -tlnp | grep 18789)"
echo "  View config:   cat ~/.clawdbot/clawdbot.json | grep -A 5 gateway"
echo "  Test endpoint: curl http://localhost:18789"
echo "  Open browser:  chromium-browser http://localhost:18789  (or: xdg-open http://localhost:18789)"
echo "  Stop gateway:  pkill -f 'clawdbot gateway'"
echo "  Start gateway: source ~/.bashrc && clawdbot gateway run"
echo ""
echo -e "${YELLOW}Gateway Port: 18789 (localhost only - bind: loopback)${NC}"
echo ""

# Save computer ID for future reference
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "$COMPUTER_ID" > "$SCRIPT_DIR/.computer-id"
log_info "Computer ID saved to $SCRIPT_DIR/.computer-id"
echo ""
