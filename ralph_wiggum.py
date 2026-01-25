#!/usr/bin/env python3
"""
Ralph Wiggum - Autonomous AI Task Executor for Samantha

Features:
- Monitors tasks.md for P0 (explicit) tasks
- Infers P1/P2 tasks from vault when no explicit tasks
- Uses Orgo SDK for computer use (GUI control, screenshots)
- Uses Anthropic API with tool use for intelligent execution
"""

import os
import sys
import time
import json
import subprocess
import traceback
from pathlib import Path
from datetime import datetime

# Configuration
VAULT_PATH = Path.home() / "vault"
TASKS_FILE = VAULT_PATH / "tasks.md"
COMPLETED_DIR = VAULT_PATH / "completed_tasks"
CONTEXT_DIR = VAULT_PATH / "context"
LOGS_DIR = VAULT_PATH / "logs"
CLAUDE_MD = VAULT_PATH / "CLAUDE.md"
LOG_FILE = Path.home() / "ralph_wiggum.log"
LOCK_FILE = Path("/tmp/ralph_task.lock")

# API Keys from environment
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ORGO_API_KEY = os.environ.get("ORGO_API_KEY", "")
COMPUTER_ID = os.environ.get("ORGO_COMPUTER_ID", "")

def log(message: str):
    """Log a message with timestamp."""
    timestamp = datetime.now().isoformat()
    log_line = f"[{timestamp}] {message}"
    print(log_line)
    with open(LOG_FILE, "a") as f:
        f.write(log_line + "\n")
    # Also log to vault logs
    try:
        LOGS_DIR.mkdir(exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        vault_log = LOGS_DIR / f"{today}.md"
        if not vault_log.exists():
            vault_log.write_text(f"# Samantha Log - {today}\n\n")
        with open(vault_log, "a") as f:
            f.write(f"- {timestamp}: {message}\n")
    except:
        pass

def load_claude_md() -> str:
    """Load CLAUDE.md instructions from vault."""
    try:
        if CLAUDE_MD.exists():
            return CLAUDE_MD.read_text()
    except:
        pass
    return ""

def pull_from_github():
    """Pull latest changes from GitHub."""
    try:
        result = subprocess.run(
            ["git", "pull", "--rebase", "origin", "main"],
            cwd=VAULT_PATH,
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            log("Git pull successful")
        else:
            log(f"Git pull warning: {result.stderr}")
    except Exception as e:
        log(f"Pull error: {e}")

def push_to_github():
    """Push local changes to GitHub."""
    try:
        subprocess.run(["git", "add", "."], cwd=VAULT_PATH, capture_output=True)
        result = subprocess.run(
            ["git", "commit", "-m", f"Samantha: task execution {datetime.now().strftime('%Y-%m-%d %H:%M')}"],
            cwd=VAULT_PATH,
            capture_output=True
        )
        if result.returncode == 0:
            subprocess.run(
                ["git", "push", "origin", "main"],
                cwd=VAULT_PATH,
                capture_output=True,
                timeout=30
            )
            log("Pushed changes to GitHub")
    except Exception as e:
        log(f"Push error: {e}")

def parse_explicit_tasks(content: str) -> list:
    """Parse uncompleted tasks from tasks.md (P0 priority)."""
    tasks = []
    lines = content.split("\n")
    current_task = None
    
    for line in lines:
        if line.strip().startswith("- [ ]"):
            if current_task:
                tasks.append(current_task)
            current_task = {
                "title": line.strip()[6:].strip(),
                "context": [],
                "raw_line": line,
                "priority": "P0"
            }
        elif current_task and line.strip().startswith("-"):
            current_task["context"].append(line.strip()[2:].strip())
    
    if current_task:
        tasks.append(current_task)
    
    return tasks

def load_vault_context() -> str:
    """Load all context from vault for Claude."""
    context_parts = []
    
    # Load context files
    if CONTEXT_DIR.exists():
        for f in sorted(CONTEXT_DIR.glob("*.md")):
            try:
                content = f.read_text()[:3000]
                context_parts.append(f"### {f.name}\n{content}")
            except:
                pass
    
    # Load recent completed tasks for context
    if COMPLETED_DIR.exists():
        recent_tasks = sorted(COMPLETED_DIR.glob("*.md"), reverse=True)[:3]
        for f in recent_tasks:
            try:
                content = f.read_text()[:1000]
                context_parts.append(f"### Recent: {f.name}\n{content}")
            except:
                pass
    
    return "\n\n".join(context_parts) if context_parts else "No context files yet."

def scan_daily_notes_for_todos() -> list:
    """Scan Daily/ folder for incomplete todos - these become P1 tasks."""
    tasks = []
    daily_dir = VAULT_PATH / "Daily"
    
    if not daily_dir.exists():
        return tasks
    
    try:
        # Check recent daily notes (last 7 days)
        daily_files = sorted(daily_dir.glob("*.md"), reverse=True)[:7]
        
        for daily_file in daily_files:
            try:
                content = daily_file.read_text()
                lines = content.split("\n")
                
                for line in lines:
                    if "- [ ]" in line:
                        task_text = line.strip()
                        if task_text.startswith("- [ ]"):
                            task_text = task_text[6:].strip()
                        tasks.append({
                            "title": task_text,
                            "context": [f"From daily note: {daily_file.name}"],
                            "raw_line": line,
                            "priority": "P1",
                            "source": str(daily_file)
                        })
            except:
                pass
    except:
        pass
    
    return tasks

def scan_vault_for_todos() -> list:
    """Scan entire vault for incomplete todos marked with - [ ]."""
    tasks = []
    
    try:
        # Scan all markdown files for unchecked todos
        for md_file in VAULT_PATH.rglob("*.md"):
            # Skip certain folders
            if any(skip in str(md_file) for skip in [".obsidian", "completed_tasks", "logs"]):
                continue
            # Skip tasks.md (handled separately)
            if md_file.name == "tasks.md":
                continue
            # Skip Daily (handled by scan_daily_notes_for_todos)
            if "Daily" in str(md_file):
                continue
            
            try:
                content = md_file.read_text()
                lines = content.split("\n")
                
                for line in lines:
                    if "- [ ]" in line:
                        task_text = line.strip()
                        if task_text.startswith("- [ ]"):
                            task_text = task_text[6:].strip()
                        tasks.append({
                            "title": task_text,
                            "context": [f"Found in: {md_file.relative_to(VAULT_PATH)}"],
                            "raw_line": line,
                            "priority": "P2",
                            "source": str(md_file)
                        })
            except:
                pass
    except:
        pass
    
    return tasks[:5]  # Limit to 5 scattered todos

def is_vault_mature() -> bool:
    """Check if vault has enough content to warrant task inference.
    Prevents wasting credits on empty/new vaults."""
    try:
        # Check if vault exists
        if not VAULT_PATH.exists():
            return False
        
        # Count markdown files (excluding template/system files)
        md_files = list(VAULT_PATH.rglob("*.md"))
        # Filter out system files
        md_files = [f for f in md_files 
                   if not any(skip in str(f) for skip in [".obsidian", "completed_tasks", "logs"])]
        
        # Need at least 3 non-template markdown files
        if len(md_files) < 3:
            return False
        
        # Check if context directory has meaningful content
        if CONTEXT_DIR.exists():
            context_files = list(CONTEXT_DIR.glob("*.md"))
            # If context files exist and have content, vault is mature
            for cf in context_files:
                try:
                    if len(cf.read_text().strip()) > 500:  # At least 500 chars
                        return True
                except:
                    pass
        
        # Check if there are any completed tasks (indicates vault has been used)
        if COMPLETED_DIR.exists():
            completed_count = len(list(COMPLETED_DIR.glob("*.md")))
            # If there are completed tasks, vault is mature
            if completed_count > 0:
                return True
        
        # Check total content size across all markdown files
        total_size = 0
        for md_file in md_files[:10]:  # Check first 10 files
            try:
                total_size += len(md_file.read_text())
            except:
                pass
        
        # Need at least 2000 characters of content
        return total_size >= 2000
        
    except Exception as e:
        log(f"Error checking vault maturity: {e}")
        return False

def infer_tasks_from_vault() -> list:
    """When tasks.md is empty, find tasks from various vault sources."""
    log("No explicit tasks found. Scanning vault for implicit tasks...")
    
    # Priority 1: Check Daily notes for incomplete todos
    daily_tasks = scan_daily_notes_for_todos()
    if daily_tasks:
        log(f"Found {len(daily_tasks)} tasks in Daily notes")
        return daily_tasks[:3]  # Return top 3
    
    # Priority 2: Scan other files for scattered todos
    scattered_tasks = scan_vault_for_todos()
    if scattered_tasks:
        log(f"Found {len(scattered_tasks)} scattered todos in vault")
        return scattered_tasks[:3]
    
    # Priority 3: Use AI to infer tasks from context
    # BUT: Only if vault is mature enough (has meaningful content)
    if not is_vault_mature():
        log("Vault is too new/empty for task inference. Skipping AI inference to save credits.")
        log("Add explicit tasks to tasks.md or wait until vault has more content.")
        return []
    
    log("No todos found. Using AI to analyze vault for implicit tasks...")
    
    try:
        import anthropic
        client = anthropic.Anthropic()
        
        vault_context = load_vault_context()
        
        # Additional check: if context is too minimal, skip AI inference
        if len(vault_context.strip()) < 500:
            log("Vault context too minimal for AI inference. Skipping to save credits.")
            return []
        
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": f"""Analyze this vault (the user's knowledge base) and identify any implicit tasks that should be done.

## Vault Contents
{vault_context}

## What to look for:
- Upcoming deadlines or events mentioned in notes
- Patterns suggesting recurring tasks (daily/weekly reviews, etc.)
- Follow-ups needed based on context
- Context files that need updating
- Opportunities to be proactively helpful

## CRITICAL: Be VERY conservative
- Do NOT suggest tasks for checking non-existent directories (e.g., "Check Daily/*.md" when Daily doesn't exist)
- Do NOT suggest maintenance tasks unless explicitly needed
- Only suggest tasks that are clearly actionable and necessary
- If the vault is mostly empty or just setup, return an empty array

Return a JSON array of inferred tasks. Be conservative - only suggest tasks that clearly should be done.
Format: [{{"title": "Task description", "priority": "P1 or P2", "reason": "Why this task was inferred"}}]

If no tasks can be reasonably inferred, return an empty array: []
"""
            }]
        )
        
        # Parse response
        text = response.content[0].text
        # Find JSON in response
        import re
        json_match = re.search(r'\[.*\]', text, re.DOTALL)
        if json_match:
            tasks_data = json.loads(json_match.group())
            tasks = []
            for t in tasks_data[:3]:  # Limit to 3 inferred tasks
                task_title = t.get("title", "").strip()
                # Filter out low-value tasks
                if not task_title:
                    continue
                # Skip tasks that are just checking for non-existent things
                if any(skip_phrase in task_title.lower() for skip_phrase in [
                    "check daily", "check for daily", "verify daily exists",
                    "check if daily", "scan daily", "look for daily"
                ]):
                    log(f"Skipping low-value inferred task: {task_title}")
                    continue
                
                tasks.append({
                    "title": task_title,
                    "context": [f"Inferred: {t.get('reason', '')}"],
                    "raw_line": "",
                    "priority": t.get("priority", "P2")
                })
            log(f"Inferred {len(tasks)} tasks from vault (after filtering)")
            return tasks
        
    except Exception as e:
        log(f"Error inferring tasks: {e}")
    
    return []

# ============= ORGO REST API FUNCTIONS =============
# Use REST API directly instead of the buggy Python SDK

ORGO_API_BASE = "https://www.orgo.ai/api"

def orgo_request(endpoint: str, method: str = "GET", data: dict = None) -> dict:
    """Make a request to the Orgo REST API."""
    import urllib.request
    import urllib.error
    
    url = f"{ORGO_API_BASE}{endpoint}"
    headers = {
        "Authorization": f"Bearer {ORGO_API_KEY}",
        "Content-Type": "application/json"
    }
    
    req_data = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        log(f"Orgo API error: {e.code} - {error_body}")
        return {"error": error_body}
    except Exception as e:
        log(f"Orgo request error: {e}")
        return {"error": str(e)}

def orgo_get_desktop_state() -> dict:
    """Get structured desktop state from Orgo (without image)."""
    # Use bash command that returns desktop state (some Orgo responses include this)
    result = orgo_bash("echo 'desktop_state'")
    # Check if response includes desktop state
    if isinstance(result, dict) and "desktop" in result:
        return result["desktop"]
    return {}

def orgo_screenshot(return_url: bool = True) -> str:
    """Take a screenshot of the VM. Returns image URL (preferred) or base64 if URL unavailable.
    
    Args:
        return_url: If True, return URL when available (saves tokens). If False, always return base64.
    """
    import urllib.request
    import urllib.error
    import base64
    
    url = f"{ORGO_API_BASE}/computers/{COMPUTER_ID}/screenshot"
    headers = {
        "Authorization": f"Bearer {ORGO_API_KEY}"
    }
    
    req = urllib.request.Request(url, headers=headers, method="GET")
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            response_data = response.read()
            
            # Handle JSON response
            if "application/json" in content_type:
                try:
                    result = json.loads(response_data.decode())
                    # Try different possible field names
                    image_data = result.get("image") or result.get("screenshot") or result.get("data") or result.get("base64") or ""
                    
                    if not image_data and "desktop" in result:
                        desktop = result["desktop"]
                        if isinstance(desktop, dict):
                            image_data = desktop.get("screenshot") or desktop.get("image") or ""
                    
                    if image_data:
                        # PREFER URL over base64 (saves massive tokens!)
                        if isinstance(image_data, str) and (image_data.startswith("http://") or image_data.startswith("https://")):
                            if return_url:
                                log(f"Using screenshot URL (token-efficient): {image_data[:80]}...")
                                return image_data  # Return URL directly - Claude supports this!
                            
                            # If URL but we need base64, download and convert
                            # Handle HTTP/HTTPS URL - download, compress, and convert to base64
                            try:
                                log(f"Downloading screenshot from URL: {image_data[:80]}...")
                                img_req = urllib.request.Request(image_data)
                                with urllib.request.urlopen(img_req, timeout=30) as img_response:
                                    img_data = img_response.read()
                                    
                                    # Compress/resize image to reduce token usage
                                    try:
                                        from PIL import Image
                                        import io
                                        img = Image.open(io.BytesIO(img_data))
                                        # Resize to max 800px width (maintains aspect ratio)
                                        max_width = 800
                                        if img.width > max_width:
                                            ratio = max_width / img.width
                                            new_height = int(img.height * ratio)
                                            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                                        
                                        # Convert to RGB if needed (for JPEG)
                                        if img.mode != 'RGB':
                                            img = img.convert('RGB')
                                        
                                        # Save as JPEG with quality 75 (good balance of size/quality)
                                        output = io.BytesIO()
                                        img.save(output, format='JPEG', quality=75, optimize=True)
                                        img_data = output.getvalue()
                                        log(f"Screenshot compressed: {len(img_data)} bytes")
                                    except ImportError:
                                        log("PIL not available, using original image")
                                    except Exception as e:
                                        log(f"Image compression failed: {e}, using original")
                                    
                                    image_base64 = base64.b64encode(img_data).decode("utf-8")
                                    if len(image_base64) >= 100:
                                        log(f"Screenshot encoded: {len(image_base64)} chars")
                                        return image_base64
                                    else:
                                        log(f"Downloaded image too small: {len(image_base64)} chars")
                                        return ""
                            except Exception as e:
                                log(f"Failed to download screenshot from URL: {e}")
                                return ""
                        
                        # Handle data URL format
                        elif isinstance(image_data, str) and image_data.startswith("data:image"):
                            image_data = image_data.split(",", 1)[1] if "," in image_data else image_data
                        elif isinstance(image_data, str) and image_data.startswith("data:"):
                            image_data = image_data.split(",", 1)[1] if "," in image_data else image_data
                        
                        # If it's already base64, validate and return
                        if len(image_data) >= 100:
                            return str(image_data)
                        else:
                            log(f"Screenshot JSON data too short: {len(image_data)} chars. Preview: {image_data[:100]}")
                    else:
                        log(f"Screenshot JSON missing image field. Keys: {list(result.keys())}")
                except json.JSONDecodeError:
                    log(f"Screenshot response is not valid JSON")
                    return ""
            
            # Handle binary image (convert to base64)
            elif "image/" in content_type:
                image_base64 = base64.b64encode(response_data).decode("utf-8")
                if len(image_base64) >= 100:
                    return image_base64
                else:
                    log(f"Screenshot binary data too short: {len(image_base64)} chars")
                    return ""
            
            # Handle plain text/string (might be base64 already)
            elif "text/" in content_type or not content_type:
                text_data = response_data.decode("utf-8").strip()
                # Check if it looks like base64
                import re
                if re.match(r'^[A-Za-z0-9+/=]+$', text_data) and len(text_data) >= 100:
                    return text_data
                else:
                    log(f"Screenshot text response invalid. Length: {len(text_data)}, Preview: {text_data[:100]}")
                    return ""
            
            else:
                log(f"Screenshot unexpected content-type: {content_type}")
                return ""
                
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        log(f"Screenshot HTTP error {e.code}: {error_body[:200]}")
        return ""
    except Exception as e:
        log(f"Screenshot error: {e}")
        return ""
    
    return ""

def orgo_bash(command: str) -> dict:
    """Execute a bash command on the VM."""
    result = orgo_request(f"/computers/{COMPUTER_ID}/bash", "POST", {"command": command})
    return result

def orgo_click(x: int, y: int, button: str = "left") -> dict:
    """Click at coordinates on the VM screen."""
    result = orgo_request(f"/computers/{COMPUTER_ID}/click", "POST", {
        "x": x, "y": y, "button": button
    })
    return result

def orgo_type(text: str) -> dict:
    """Type text on the VM."""
    result = orgo_request(f"/computers/{COMPUTER_ID}/type", "POST", {"text": text})
    return result

def orgo_key(key: str) -> dict:
    """Press a key on the VM (e.g., 'Return', 'Escape', 'Tab')."""
    result = orgo_request(f"/computers/{COMPUTER_ID}/key", "POST", {"key": key})
    return result

def orgo_scroll(x: int, y: int, direction: str = "down", amount: int = 3) -> dict:
    """Scroll at coordinates."""
    result = orgo_request(f"/computers/{COMPUTER_ID}/scroll", "POST", {
        "x": x, "y": y, "direction": direction, "amount": amount
    })
    return result

def execute_task_with_orgo(task: dict) -> dict:
    """Execute a task using Orgo REST API with full computer use capabilities."""
    log(f"Executing task with Orgo computer use: {task['title']}")
    
    try:
        import anthropic
        import base64
        
        client = anthropic.Anthropic()
        
        # Load CLAUDE.md for behavioral guidance
        claude_md = load_claude_md()
        vault_context = load_vault_context()
        task_context = "\n".join(f"  - {c}" for c in task.get("context", []))
        
        # Define computer use tools for Claude
        tools = [
            {
                "name": "computer",
                "description": "Control the computer: take screenshots, click, type, scroll, press keys.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["screenshot", "click", "type", "key", "scroll"],
                            "description": "The action to perform"
                        },
                        "x": {"type": "integer", "description": "X coordinate for click/scroll"},
                        "y": {"type": "integer", "description": "Y coordinate for click/scroll"},
                        "text": {"type": "string", "description": "Text to type"},
                        "key": {"type": "string", "description": "Key to press (Return, Escape, Tab, etc.)"},
                        "button": {"type": "string", "enum": ["left", "right", "middle"], "description": "Mouse button"},
                        "direction": {"type": "string", "enum": ["up", "down"], "description": "Scroll direction"}
                    },
                    "required": ["action"]
                }
            },
            {
                "name": "bash",
                "description": "Execute a bash command on the computer.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "The bash command to execute"}
                    },
                    "required": ["command"]
                }
            },
            {
                "name": "read_file",
                "description": "Read contents of a file.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path to the file"}
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "write_file",
                "description": "Write content to a file.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path to write to"},
                        "content": {"type": "string", "description": "Content to write"}
                    },
                    "required": ["path", "content"]
                }
            },
            {
                "name": "task_complete",
                "description": "Mark the current task as complete with a summary.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string", "description": "Summary of what was accomplished"}
                    },
                    "required": ["summary"]
                }
            }
        ]
        
        system_prompt = f"""{claude_md[:3500] if claude_md else "You are Samantha, an autonomous AI assistant."}

---

## Your Memory Vault
Location: ~/vault/
{vault_context[:1500]}

## CRITICAL: GUI-First Approach
**ALWAYS use GUI tools first for user-facing tasks!**

### For Web Tasks (booking, searching, browsing):
1. **Open the browser**: Use 'computer' tool with action='click' to click the browser icon/app
2. **Navigate**: Use 'computer' tool with action='type' to type URLs, then action='key' to press Return
3. **Interact**: Use 'computer' tool to click, scroll, and type in the browser
4. **Take screenshots when necessary** (action='screenshot') to see what's happening

### For GUI Tasks:
- **Open apps**: Click on desktop icons or taskbar buttons
- **Interact with windows**: Click, type, scroll using 'computer' tool
- **Take screenshots**: Use action='screenshot' often to see the current state
- **Don't just use bash** - if the user can see it, use GUI tools!

### Computer Tool Actions:
- action='screenshot' - See the current screen
- action='click' (x, y) - Click at coordinates
- action='type' (text) - Type text where focus is
- action='key' (key_name) - Press Return, Escape, Tab, etc.
- action='scroll' (x, y, direction) - Scroll at location

### When to use bash:
- Only for background operations (git, file management)
- NOT for opening applications or web browsing
- NOT for tasks the user should see happening

**Remember**: If the task involves opening a browser, booking something, or any visual interaction - USE GUI TOOLS, not bash!
"""

        # Take initial screenshot (use URL to save tokens!)
        log("Taking initial screenshot (using URL for token efficiency)...")
        initial_screenshot = orgo_screenshot(return_url=True)
        
        # Determine if it's a URL or base64
        is_url = False
        if initial_screenshot:
            initial_screenshot = initial_screenshot.strip()
            if initial_screenshot.startswith("http://") or initial_screenshot.startswith("https://"):
                is_url = True
                log(f"Using screenshot URL (saves tokens): {initial_screenshot[:80]}...")
            else:
                # Validate base64 (basic check)
                import re
                if not re.match(r'^[A-Za-z0-9+/=]+$', initial_screenshot) or len(initial_screenshot) < 100:
                    log(f"Screenshot data invalid (length: {len(initial_screenshot)}), skipping image")
                    initial_screenshot = None
        
        messages = []
        
        # Initial message with screenshot (URL preferred over base64)
        if initial_screenshot:
            image_content = {
                "type": "image",
                "source": {
                    "type": "url" if is_url else "base64",
                    "url": initial_screenshot if is_url else None,
                    "media_type": "image/png" if not is_url else None,
                    "data": initial_screenshot if not is_url else None
                }
            }
            # Remove None values
            if is_url:
                image_content["source"] = {"type": "url", "url": initial_screenshot}
            else:
                image_content["source"] = {"type": "base64", "media_type": "image/png", "data": initial_screenshot}
            
            messages.append({
                "role": "user",
                "content": [
                    image_content,
                    {
                        "type": "text",
                        "text": f"""Execute this task:

**{task['title']}** ({task.get('priority', 'P0')})
{task_context if task_context else ""}

**IMPORTANT**: This task should be performed using GUI interactions visible on screen:
- For web tasks: Open browser using computer tool (click browser icon), then navigate and interact with the computer tool
- Take screenshots frequently to see your progress
- Use GUI tools (click, type, key) rather than bash commands when the user should see the interaction

Here's the current screen. Start by taking a screenshot if needed, then begin the task using GUI tools. Call task_complete when finished."""
                    }
                ]
            })
        else:
            messages.append({
                "role": "user",
                "content": f"""Execute this task:

**{task['title']}** ({task.get('priority', 'P0')})
{task_context if task_context else ""}

Use tools to complete this. Call task_complete when finished."""
            })
        
        max_iterations = 25
        for iteration in range(max_iterations):
            log(f"Orgo iteration {iteration + 1}/{max_iterations}")
            
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=system_prompt,
                tools=tools,
                messages=messages
            )
            
            if response.stop_reason == "end_turn":
                text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        text += block.text
                return {"success": True, "output": text or "Completed", "error": None}
            
            if response.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": response.content})
                tool_results = []
                
                for block in response.content:
                    if block.type == "tool_use":
                        result = process_orgo_tool(block.name, block.input)
                        
                        if isinstance(result, dict) and result.get("type") == "task_complete":
                            return {"success": True, "output": result.get("summary", "Completed"), "error": None}
                        
                        # Handle image results (screenshots) - prefer URLs to save tokens
                        if isinstance(result, dict) and result.get("type") == "image":
                            source = result.get("source", {})
                            if source.get("type") == "url":
                                # Use URL (token-efficient!) 
                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": [
                                        {
                                            "type": "image",
                                            "source": {
                                                "type": "url",
                                                "url": source.get("url")
                                            }
                                        }
                                    ]
                                })
                            else:
                                # Fallback to base64
                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": [
                                        {
                                            "type": "image",
                                            "source": {
                                                "type": "base64",
                                                "media_type": "image/png",
                                                "data": result.get("data", "") or source.get("data", "")
                                            }
                                        }
                                    ]
                                })
                        else:
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(result)
                            })
                
                messages.append({"role": "user", "content": tool_results})
        
        return {"success": False, "output": "", "error": "Max iterations reached"}
        
    except Exception as e:
        log(f"Orgo execution error: {e}")
        traceback.print_exc()
        # Fall back to Anthropic-only execution
        log("Falling back to Anthropic API without computer use...")
        return execute_task_with_anthropic(task)

def process_orgo_tool(name: str, input_data: dict):
    """Process a tool call for Orgo computer use."""
    log(f"Orgo Tool: {name} - {json.dumps(input_data)[:100]}")
    
    if name == "computer":
        action = input_data.get("action")
        
        if action == "screenshot":
            screenshot = orgo_screenshot(return_url=True)  # Prefer URL to save tokens
            if screenshot:
                # Check if it's a URL or base64
                if screenshot.startswith("http://") or screenshot.startswith("https://"):
                    return {"type": "image", "source": {"type": "url", "url": screenshot}}
                else:
                    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": screenshot}}
            return "Failed to take screenshot"
        
        elif action == "click":
            x = input_data.get("x", 0)
            y = input_data.get("y", 0)
            button = input_data.get("button", "left")
            result = orgo_click(x, y, button)
            return f"Clicked at ({x}, {y}) with {button} button"
        
        elif action == "type":
            text = input_data.get("text", "")
            result = orgo_type(text)
            return f"Typed: {text[:50]}..."
        
        elif action == "key":
            key = input_data.get("key", "Return")
            result = orgo_key(key)
            return f"Pressed key: {key}"
        
        elif action == "scroll":
            x = input_data.get("x", 500)
            y = input_data.get("y", 500)
            direction = input_data.get("direction", "down")
            result = orgo_scroll(x, y, direction)
            return f"Scrolled {direction} at ({x}, {y})"
        
        return f"Unknown computer action: {action}"
    
    elif name == "bash":
        command = input_data.get("command", "")
        result = orgo_bash(command)
        output = result.get("output", "")
        exit_code = result.get("exit_code", -1)
        return f"Exit code: {exit_code}\nOutput: {output[:3000]}"
    
    elif name == "read_file":
        path = input_data.get("path", "")
        result = orgo_bash(f"cat '{path}'")
        return result.get("output", f"Error reading {path}")[:8000]
    
    elif name == "write_file":
        path = input_data.get("path", "")
        content = input_data.get("content", "")
        # Escape content for bash
        escaped = content.replace("'", "'\\''")
        result = orgo_bash(f"mkdir -p $(dirname '{path}') && cat > '{path}' << 'EOFWRITE'\n{content}\nEOFWRITE")
        if str(VAULT_PATH) in path:
            push_to_github()
        return f"Wrote to {path} (synced)" if "error" not in str(result).lower() else f"Error: {result}"
    
    elif name == "task_complete":
        return {"type": "task_complete", "summary": input_data.get("summary", "Completed")}
    
    return f"Unknown tool: {name}"

def execute_task_with_anthropic(task: dict) -> dict:
    """Fallback: Execute task using direct Anthropic API with tools."""
    log(f"Executing task with Anthropic API: {task['title']}")
    
    try:
        import anthropic
        client = anthropic.Anthropic()
        
        vault_context = load_vault_context()
        task_context = "\n".join(f"  - {c}" for c in task.get("context", []))
        
        # Define tools
        tools = [
            {
                "name": "bash",
                "description": "Execute a bash command. Use for file operations, git, system tasks.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "The bash command to execute"}
                    },
                    "required": ["command"]
                }
            },
            {
                "name": "read_file",
                "description": "Read contents of a file.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path to the file"}
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "write_file",
                "description": "Write content to a file.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Path to write to"},
                        "content": {"type": "string", "description": "Content to write"}
                    },
                    "required": ["path", "content"]
                }
            },
            {
                "name": "task_complete",
                "description": "Mark the current task as complete with a summary.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string", "description": "Summary of what was accomplished"}
                    },
                    "required": ["summary"]
                }
            }
        ]
        
        # Load CLAUDE.md for behavioral guidance
        claude_md = load_claude_md()
        
        system_prompt = f"""{claude_md[:3000] if claude_md else "You are Samantha, an autonomous AI agent."}

---

## Your Memory Vault
Location: ~/vault/
{vault_context[:2000]}

## Tool Guidelines
1. Use tools aggressively to accomplish the task
2. Save learnings to ~/vault/context/
3. When done, use task_complete tool with summary
4. Log important actions

**CRITICAL**: For tasks involving browsers, booking, or web research - use GUI tools, NOT bash commands!
"""

        messages = [{
            "role": "user",
            "content": f"""Execute this task:

**{task['title']}**
{task_context if task_context else ""}

**IMPORTANT**: If this task involves web browsing, booking, or research:
- Use GUI tools to open the browser and interact with pages
- The browser will be visible on screen
- Prefer GUI actions over bash commands

Use tools to complete this. Call task_complete when finished."""
        }]
        
        max_iterations = 15
        for iteration in range(max_iterations):
            log(f"API iteration {iteration + 1}/{max_iterations}")
            
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=system_prompt,
                tools=tools,
                messages=messages
            )
            
            if response.stop_reason == "end_turn":
                text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        text += block.text
                return {"success": True, "output": text or "Completed", "error": None}
            
            if response.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": response.content})
                tool_results = []
                
                for block in response.content:
                    if block.type == "tool_use":
                        result = process_tool(block.name, block.input)
                        
                        if result.startswith("TASK_COMPLETE:"):
                            return {"success": True, "output": result[14:], "error": None}
                        
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result
                        })
                
                messages.append({"role": "user", "content": tool_results})
        
        return {"success": False, "output": "", "error": "Max iterations reached"}
        
    except Exception as e:
        log(f"Anthropic API error: {e}")
        return {"success": False, "output": "", "error": str(e)}

def process_tool(name: str, input_data: dict) -> str:
    """Process a tool call."""
    log(f"Tool: {name}")
    
    if name == "bash":
        try:
            result = subprocess.run(
                input_data["command"],
                shell=True,
                capture_output=True,
                text=True,
                timeout=120,
                cwd=str(VAULT_PATH)
            )
            return f"Exit code: {result.returncode}\nOutput: {result.stdout[:3000]}\nErrors: {result.stderr[:500]}"
        except Exception as e:
            return f"Error: {e}"
    
    elif name == "read_file":
        try:
            path = Path(input_data["path"]).expanduser()
            return path.read_text()[:8000]
        except Exception as e:
            return f"Error reading file: {e}"
    
    elif name == "write_file":
        try:
            path = Path(input_data["path"]).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(input_data["content"])
            # Push to GitHub after every file write to the vault
            if str(VAULT_PATH) in str(path):
                push_to_github()
            return f"Successfully wrote to {input_data['path']} (synced to GitHub)"
        except Exception as e:
            return f"Error writing: {e}"
    
    elif name == "task_complete":
        return f"TASK_COMPLETE:{input_data['summary']}"
    
    return f"Unknown tool: {name}"

def archive_task(task: dict, result: dict):
    """Archive completed task with results and push to GitHub."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_file = COMPLETED_DIR / f"task_{timestamp}.md"
    
    status = "✅ Completed" if result["success"] else "❌ Failed"

    # Build error section separately (can't use backslash in f-string)
    error_section = f"## Error\n{result.get('error')}" if result.get('error') else ""
    
    content = f"""# {status}: {task['title']}

**Priority:** {task.get('priority', 'P0')}
**Executed:** {datetime.now().isoformat()}

## Result
{result.get('output', 'No output')[:5000]}

{error_section}

---
*Archived by Samantha on {datetime.now().strftime('%Y-%m-%d %H:%M')}*
"""
    
    COMPLETED_DIR.mkdir(exist_ok=True)
    archive_file.write_text(content)
    
    # Update tasks.md if it was an explicit task
    if task.get("raw_line") and TASKS_FILE.exists():
        tasks_content = TASKS_FILE.read_text()
        updated = tasks_content.replace(task["raw_line"], task["raw_line"].replace("- [ ]", "- [x]"))
        TASKS_FILE.write_text(updated)
    
    log(f"Archived: {task['title']} - {status}")
    
    # Push immediately after archiving
    push_to_github()

def main():
    log("=" * 50)
    log("Ralph Wiggum (Samantha Task Executor) starting...")
    log(f"Vault: {VAULT_PATH}")
    log(f"Computer ID: {COMPUTER_ID}")
    log(f"Orgo API: {'✓' if ORGO_API_KEY else '✗'}")
    log(f"Anthropic API: {'✓' if ANTHROPIC_API_KEY else '✗'}")
    log("=" * 50)
    
    COMPLETED_DIR.mkdir(exist_ok=True)
    
    while True:
        try:
            # Check lock
            if LOCK_FILE.exists():
                log("Task in progress, waiting...")
                time.sleep(30)
                continue
            
            # Pull latest
            pull_from_github()
            
            # Check for explicit P0 tasks
            tasks = []
            if TASKS_FILE.exists():
                content = TASKS_FILE.read_text()
                tasks = parse_explicit_tasks(content)
            
            # If no explicit tasks, try to infer P1/P2 tasks
            # BUT: Only if vault is mature enough (prevents wasting credits during setup)
            if not tasks:
                # Only infer tasks if vault has meaningful content
                if is_vault_mature():
                    tasks = infer_tasks_from_vault()
                else:
                    log("Vault is too new/empty. Skipping task inference. Add explicit tasks to tasks.md or wait for vault to mature.")
            
            if tasks:
                task = tasks[0]  # Execute first task
                log(f"Executing {task.get('priority', 'P0')} task: {task['title']}")
                
                # Create lock
                LOCK_FILE.write_text(task["title"])
                
                try:
                    # Try Orgo computer use first (full capabilities)
                    if ORGO_API_KEY and COMPUTER_ID:
                        result = execute_task_with_orgo(task)
                    else:
                        # Fallback to direct Anthropic API
                        result = execute_task_with_anthropic(task)
                    
                    archive_task(task, result)
                    push_to_github()  # Always push after task completion
                    
                except Exception as e:
                    log(f"Task execution error: {e}")
                    traceback.print_exc()
                    push_to_github()  # Push error logs too
                finally:
                    LOCK_FILE.unlink(missing_ok=True)
            else:
                log("No tasks found")
            
        except Exception as e:
            log(f"Main loop error: {e}")
            LOCK_FILE.unlink(missing_ok=True)
        
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    main()

