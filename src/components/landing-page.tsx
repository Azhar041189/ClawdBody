'use client'

import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Github, Mail, Calendar, Code, MessageSquare, Zap, Brain, Sparkles } from 'lucide-react'

export function LandingPage() {
  const integrations = [
    { name: 'Gmail', icon: Mail, color: 'text-red-400' },
    { name: 'Calendar', icon: Calendar, color: 'text-blue-400' },
    { name: 'GitHub', icon: Code, color: 'text-gray-300' },
    { name: 'Slack', icon: MessageSquare, color: 'text-purple-400' },
  ]

  const features = [
    {
      icon: Zap,
      title: "No Setup Hassle",
      description: "Don't spend hours setting it up. Get started in minutes."
    },
    {
      icon: Brain,
      title: "24/7 Automation",
      description: "Runs continuously on Orgo VM, automating your life around the clock."
    },
    {
      icon: Sparkles,
      title: "Intelligent Actions",
      description: "Infers tasks, plans, and executes them—taking actions on your behalf."
    },
  ]

  return (
    <div className="landing-page-container min-h-screen relative overflow-hidden bg-transparent">
      <div className="landing-nebula" />
      <div className="landing-stars" />

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-24">
        {/* Hero Section */}
        <div className="text-center mb-16 sm:mb-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <div className="inline-block relative">
              <motion.div
                className="text-6xl sm:text-7xl lg:text-8xl font-bold mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <span className="bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent">
                  ClawdBrain
                </span>
              </motion.div>
              <motion.div
                className="absolute -top-2 -right-2 w-4 h-4 bg-rose-400 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </motion.div>

          <motion.h2
            className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-rose-400 mb-6 tracking-[0.35em] uppercase"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            THE UX + BRAIN FOR CLAWDBOT
          </motion.h2>

          <motion.p
            className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            Making ClawdBot accessible for everyone. Connects with Gmail, Calendar, GitHub, Slack, and more—so your AI can infer tasks, plan, and execute them automatically.
          </motion.p>

          <motion.button
            onClick={() => signIn('github')}
            className="group relative px-8 py-4 bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 text-slate-950 font-semibold rounded-full text-lg shadow-lg shadow-rose-500/40 hover:shadow-rose-500/60 transition-all duration-300 hover:scale-105"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              Get Started
            </span>
          </motion.button>
        </div>

        {/* Features Section */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-16 sm:mb-24"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8 hover:bg-white/10 transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + index * 0.1, duration: 0.6 }}
              whileHover={{ y: -5 }}
            >
              <feature.icon className="w-8 h-8 sm:w-10 sm:h-10 text-teal-300 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Integrations Section */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.6 }}
        >
          <h3 className="text-2xl sm:text-3xl font-semibold text-white mb-8">
            Connects With Everything
          </h3>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12">
            {integrations.map((integration, index) => (
              <motion.div
                key={integration.name}
                className="flex flex-col items-center gap-2 group"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.7 + index * 0.1, duration: 0.4 }}
                whileHover={{ scale: 1.1 }}
              >
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-all duration-300">
                  <integration.icon className={`w-6 h-6 sm:w-8 sm:h-8 ${integration.color}`} />
                </div>
                <span className="text-sm sm:text-base text-gray-400">{integration.name}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
