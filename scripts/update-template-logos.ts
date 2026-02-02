import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function getEmojiForTemplate(name: string, description: string): string {
  const nameLower = name.toLowerCase()
  const combined = (name + ' ' + description).toLowerCase()
  
  // Check name first for more accurate matching
  if (nameLower.includes('assistant') || nameLower.includes('personal')) return '🤖'
  if (nameLower.includes('stock') || nameLower.includes('trading') || nameLower.includes('crypto')) return '📈'
  if (nameLower.includes('social') || nameLower.includes('media manager')) return '📱'
  if (nameLower.includes('data') || nameLower.includes('analysis')) return '📊'
  
  // Then check combined for broader matches
  if (combined.includes('stock') || combined.includes('trading') || combined.includes('crypto') || combined.includes('market')) return '📈'
  if (combined.includes('social') || combined.includes('twitter') || combined.includes('x.com') || combined.includes('media manager')) return '📱'
  if (combined.includes('data') || combined.includes('analysis') || combined.includes('spreadsheet')) return '📊'
  if (combined.includes('code') || combined.includes('github') || combined.includes('review')) return '💻'
  if (combined.includes('devops') || combined.includes('deploy') || combined.includes('infra')) return '🖥️'
  if (combined.includes('monitor') || combined.includes('alert')) return '🔔'
  if (combined.includes('research') || combined.includes('paper') || combined.includes('study')) return '📚'
  if (combined.includes('write') || combined.includes('content') || combined.includes('blog')) return '✍️'
  if (combined.includes('support') || combined.includes('customer') || combined.includes('help')) return '💬'
  if (combined.includes('security') || combined.includes('audit') || combined.includes('scan')) return '🔒'
  if (combined.includes('search') || combined.includes('find')) return '🔍'
  if (combined.includes('automat') || combined.includes('workflow')) return '⚡'
  if (combined.includes('email') || combined.includes('mail')) return '📧'
  if (combined.includes('calendar') || combined.includes('schedule')) return '📅'
  if (combined.includes('assistant') || combined.includes('personal')) return '🤖'
  
  return '🤖'
}

async function updateLogos() {
  const templates = await prisma.marketplaceTemplate.findMany()
  console.log('Found', templates.length, 'templates')
  
  for (const t of templates) {
    const emoji = getEmojiForTemplate(t.name, t.description)
    console.log('Updating', t.name, '->', emoji)
    await prisma.marketplaceTemplate.update({
      where: { id: t.id },
      data: { logo: emoji }
    })
  }
  
  console.log('Done!')
  await prisma.$disconnect()
}

updateLogos().catch(console.error)
