"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { BookOpen, Target, Activity, Check, ChevronRight, ChevronDown, Menu, X, ArrowRight, Sparkles, GraduationCap, Shield } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged, User } from "firebase/auth"

export default function LandingPage() {
 const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
 const [isProductsOpen, setIsProductsOpen] = useState(false)
 const [user, setUser] = useState<User | null>(null)
 const [scrolled, setScrolled] = useState(false)

 useEffect(() => {
 const handleScroll = () => setScrolled(window.scrollY > 20)
 window.addEventListener("scroll", handleScroll)
 return () => window.removeEventListener("scroll", handleScroll)
 }, [])

 useEffect(() => {
 const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
 setUser(currentUser)
 })
 return () => unsubscribe()
 }, [])

 return (
 <div className="min-h-screen bg-[#FDFDFD] selection:bg-primary-500/20 selection:text-primary-600 font-sans text-foreground overflow-x-hidden">
 
 {/* Sleek Enterprise Header */}
 <header className={cn(
 "fixed top-0 inset-x-0 z-50 transition-all duration-300 border-b",
 scrolled ? "bg-white/80 backdrop-blur-xl border-gray-200/60 shadow-sm py-3" : "bg-transparent border-transparent py-5"
 )}>
 <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
 <Link href="/" className="flex items-center gap-2 group">
 <Logo showText={true} />
 </Link>

 {/* Desktop Navigation */}
 <nav className="hidden md:flex items-center gap-8 h-full">
 {/* Products Dropdown */}
 <div 
 className="relative group h-full flex items-center"
 onMouseEnter={() => setIsProductsOpen(true)}
 onMouseLeave={() => setIsProductsOpen(false)}
 >
 <button className="flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-black transition-colors py-2">
 Products <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isProductsOpen && "rotate-180")} />
 </button>
 
 {/* Mega Menu Dropdown */}
 <div className={cn(
 "absolute top-[120%] left-1/2 -translate-x-1/2 w-[600px] transition-all origin-top",
 isProductsOpen ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible"
 )}>
 <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-4 grid grid-cols-2 gap-4 relative mt-2">
 <Link href="/product/learning" className="group/item p-4 rounded-xl hover:bg-gray-50 transition-colors flex gap-4">
 <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
 <BookOpen size={20} />
 </div>
 <div>
 <p className="text-sm font-bold text-gray-900 group-hover/item:text-blue-600 transition-colors">AeroLearn Core</p>
 <p className="text-xs text-gray-500 mt-1 leading-relaxed">Structured, engaging curriculum from JSS1 to SS3.</p>
 </div>
 </Link>
 <Link href="/product/practice" className="group/item p-4 rounded-xl hover:bg-gray-50 transition-colors flex gap-4">
 <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
 <Target size={20} />
 </div>
 <div>
 <p className="text-sm font-bold text-gray-900 group-hover/item:text-purple-600 transition-colors">AeroLearn Practice</p>
 <p className="text-xs text-gray-500 mt-1 leading-relaxed">Thousands of WAEC & JAMB past questions.</p>
 </div>
 </Link>
 <Link href="/product/analytics" className="group/item p-4 rounded-xl hover:bg-gray-50 transition-colors flex gap-4">
 <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
 <Activity size={20} />
 </div>
 <div>
 <p className="text-sm font-bold text-gray-900 group-hover/item:text-emerald-600 transition-colors">AeroLearn Analytics</p>
 <p className="text-xs text-gray-500 mt-1 leading-relaxed">AI-driven insights, streaks, and progress tracking.</p>
 </div>
 </Link>
 <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col justify-center">
 <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">New Release</p>
 <p className="text-sm font-bold text-gray-900">Parent Portal</p>
 <p className="text-xs text-gray-500 mt-1">Track your child's learning journey in real-time.</p>
 </div>
 </div>
 </div>
 </div>

 <Link href="/pricing" className="text-sm font-semibold text-gray-600 hover:text-black transition-colors">Pricing</Link>
 </nav>

 <div className="hidden md:flex items-center gap-6">
 {user ? (
 <Link href="/app" className="text-sm font-bold text-white bg-black hover:bg-gray-800 px-6 py-2.5 rounded-full transition-colors">
 Go to Dashboard
 </Link>
 ) : (
 <>
 <Link href="/auth/login" className="text-sm font-semibold text-gray-600 hover:text-black transition-colors">
 Sign in
 </Link>
 <Link href="/auth/signup" className="text-sm font-bold text-white bg-black hover:bg-gray-800 px-6 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
 Get Started Free
 </Link>
 </>
 )}
 </div>

 <button className="md:hidden p-2 text-gray-600" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
 {isMobileMenuOpen ? <X /> : <Menu />}
 </button>
 </div>
 </header>

 {/* Corporate Hero Section */}
 <section className="relative pt-40 pb-24 overflow-hidden">
 <div className="absolute top-0 left-0 w-full h-[800px] bg-[radial-gradient(ellipse_at_top,#e5e7eb_0%,#FDFDFD_70%)] opacity-60 pointer-events-none"></div>
 
 <div className="max-w-7xl mx-auto px-6 relative z-10">
 <div className="grid lg:grid-cols-2 gap-16 items-center">
 
 <div className="max-w-2xl animate-fade-in-up">
 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider mb-8">
 <Sparkles size={14} /> The New Standard in Education
 </div>
 
 <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.1] mb-6">
 Unlock your <br />
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">academic potential.</span>
 </h1>
 
 <p className="text-xl text-gray-600 mb-10 leading-relaxed font-medium">
 A highly sophisticated learning ecosystem designed to help Nigerian students master their curriculum, ace WAEC, and conquer JAMB.
 </p>
 
 <div className="flex flex-col sm:flex-row items-center gap-4">
 <Link href="/auth/signup" className="w-full sm:w-auto text-center px-8 py-4 bg-black text-white font-bold rounded-xl shadow-xl hover:shadow-2xl hover:bg-gray-800 transition-all hover:-translate-y-1 flex items-center justify-center gap-2">
 Start Learning for Free <ArrowRight size={18} />
 </Link>
 <Link href="#products" className="w-full sm:w-auto text-center px-8 py-4 bg-white text-gray-900 border border-gray-200 font-bold rounded-xl hover:bg-gray-50 transition-colors">
 Explore Products
 </Link>
 </div>
 
 <div className="mt-12 flex items-center gap-4 text-sm font-medium text-gray-500">
 <div className="flex -space-x-2">
 {[1, 2, 3, 4].map(i => (
 <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] overflow-hidden">
 <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${i}&backgroundColor=e2e8f0`} alt="Avatar" />
 </div>
 ))}
 </div>
 <div>Join <strong className="text-gray-900">10,000+</strong> students already learning.</div>
 </div>
 </div>

 {/* Premium UI Hero Graphic */}
 <div className="relative animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
 <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-[2.5rem] blur-3xl opacity-20 transform rotate-6 scale-105"></div>
 <div className="relative bg-white/60 backdrop-blur-2xl border border-white/80 shadow-2xl rounded-[2rem] p-4 overflow-hidden transform -rotate-2 hover:rotate-0 transition-transform duration-700">
 {/* Fake Browser/App Chrome */}
 <div className="flex items-center gap-2 mb-4 px-2">
 <div className="w-3 h-3 rounded-full bg-red-400"></div>
 <div className="w-3 h-3 rounded-full bg-amber-400"></div>
 <div className="w-3 h-3 rounded-full bg-green-400"></div>
 </div>
 {/* Fake Dashboard Content */}
 <div className="bg-gray-50 rounded-xl border border-gray-100 p-6">
 <div className="flex justify-between items-center mb-8">
 <div>
 <div className="h-6 w-32 bg-gray-200 rounded-md mb-2"></div>
 <div className="h-4 w-48 bg-gray-100 rounded-md"></div>
 </div>
 <div className="flex gap-2">
 <div className="h-10 w-24 bg-blue-100 rounded-full"></div>
 <div className="h-10 w-10 bg-emerald-100 rounded-full"></div>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-4 mb-4">
 <div className="h-32 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
 <div className="h-4 w-20 bg-gray-100 rounded mb-4"></div>
 <div className="h-8 w-32 bg-gray-200 rounded mb-2"></div>
 <div className="h-2 w-full bg-blue-100 rounded-full"></div>
 </div>
 <div className="h-32 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
 <div className="h-4 w-20 bg-gray-100 rounded mb-4"></div>
 <div className="h-8 w-24 bg-gray-200 rounded mb-2"></div>
 <div className="h-2 w-full bg-purple-100 rounded-full"></div>
 </div>
 </div>
 <div className="h-48 bg-white rounded-xl shadow-sm border border-gray-100"></div>
 </div>
 </div>
 
 {/* Floating Element */}
 <div className="absolute -right-8 top-1/4 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-4 animate-float hidden md:flex">
 <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
 <Check className="text-green-500 w-6 h-6" strokeWidth={3} />
 </div>
 <div>
 <p className="text-sm font-bold text-gray-900">Quiz Passed!</p>
 <p className="text-xs text-gray-500">+50 XP Earned</p>
 </div>
 </div>
 </div>

 </div>
 </div>
 </section>

 {/* Trusted By Section */}
 <section className="py-10 border-y border-gray-100 bg-white">
 <div className="max-w-7xl mx-auto px-6 text-center">
 <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Empowering students across top schools</p>
 <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale">
 {/* Logos represented by generic icons/text for now */}
 <div className="flex items-center gap-2 text-xl font-black font-serif text-gray-800"><GraduationCap /> KCL</div>
 <div className="flex items-center gap-2 text-xl font-black font-sans tracking-tight text-gray-800"><Shield /> QC Lagos</div>
 <div className="flex items-center gap-2 text-xl font-black font-serif italic text-gray-800"><BookOpen /> Corona</div>
 <div className="flex items-center gap-2 text-xl font-black font-sans text-gray-800"><Activity /> Loyola</div>
 </div>
 </div>
 </section>

 {/* Our Products Section - Microsoft Style Alternating Layout */}
 <section id="products" className="py-32 bg-white relative">
 <div className="max-w-7xl mx-auto px-6">
 <div className="text-center max-w-3xl mx-auto mb-24">
 <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-6">A complete learning ecosystem.</h2>
 <p className="text-xl text-gray-600">Everything you need to succeed, integrated into one seamless, powerful platform.</p>
 </div>

 <div className="space-y-32">
 
 {/* Product 1: AeroLearn Core */}
 <div className="grid md:grid-cols-2 gap-16 items-center">
 <div className="order-2 md:order-1 relative group">
 <div className="absolute inset-0 bg-blue-100 rounded-3xl transform -rotate-3 scale-105 opacity-50 group-hover:-rotate-1 transition-transform duration-500"></div>
 <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Students learning" className="relative rounded-2xl shadow-xl object-cover h-[400px] w-full transform group-hover:scale-[1.02] transition-transform duration-500" />
 </div>
 <div className="order-1 md:order-2">
 <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 border border-blue-100">
 <BookOpen className="text-blue-600 w-8 h-8" />
 </div>
 <h3 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">AeroLearn Core</h3>
 <p className="text-lg text-gray-600 mb-8 leading-relaxed">
 The foundation of your success. Dive into structured, easy-to-understand lessons covering the entire JSS1 to SS3 curriculum. Written by expert teachers.
 </p>
 <ul className="space-y-4 mb-8">
 <li className="flex items-start gap-3"><Check className="text-blue-600 shrink-0 mt-1" /> <span className="text-gray-700">Detailed topic breakdowns and summaries.</span></li>
 <li className="flex items-start gap-3"><Check className="text-blue-600 shrink-0 mt-1" /> <span className="text-gray-700">Rich multimedia content and diagrams.</span></li>
 <li className="flex items-start gap-3"><Check className="text-blue-600 shrink-0 mt-1" /> <span className="text-gray-700">Curriculum strictly aligned with NERDC.</span></li>
 </ul>
 <Link href="/product/learning" className="inline-flex items-center gap-2 text-blue-600 font-bold hover:text-blue-700 hover:gap-3 transition-all">
 Explore AeroLearn Core <ChevronRight size={20} />
 </Link>
 </div>
 </div>

 {/* Product 2: AeroLearn Practice */}
 <div className="grid md:grid-cols-2 gap-16 items-center">
 <div>
 <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mb-6 border border-purple-100">
 <Target className="text-purple-600 w-8 h-8" />
 </div>
 <h3 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">AeroLearn Practice</h3>
 <p className="text-lg text-gray-600 mb-8 leading-relaxed">
 Test your knowledge with our massive database of past questions. Experience the real exam environment before the big day.
 </p>
 <ul className="space-y-4 mb-8">
 <li className="flex items-start gap-3"><Check className="text-purple-600 shrink-0 mt-1" /> <span className="text-gray-700">10,000+ WAEC, NECO & JAMB Past Questions.</span></li>
 <li className="flex items-start gap-3"><Check className="text-purple-600 shrink-0 mt-1" /> <span className="text-gray-700">Timed mock exams mimicking CBT format.</span></li>
 <li className="flex items-start gap-3"><Check className="text-purple-600 shrink-0 mt-1" /> <span className="text-gray-700">Instant feedback and step-by-step solutions.</span></li>
 </ul>
 <Link href="/product/practice" className="inline-flex items-center gap-2 text-purple-600 font-bold hover:text-purple-700 hover:gap-3 transition-all">
 Explore AeroLearn Practice <ChevronRight size={20} />
 </Link>
 </div>
 <div className="relative group">
 <div className="absolute inset-0 bg-purple-100 rounded-3xl transform rotate-3 scale-105 opacity-50 group-hover:rotate-1 transition-transform duration-500"></div>
 <img src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Students practicing" className="relative rounded-2xl shadow-xl object-cover h-[400px] w-full transform group-hover:scale-[1.02] transition-transform duration-500" />
 </div>
 </div>

 {/* Product 3: AeroLearn Analytics */}
 <div className="grid md:grid-cols-2 gap-16 items-center">
 <div className="order-2 md:order-1 relative group">
 <div className="absolute inset-0 bg-emerald-100 rounded-3xl transform -rotate-3 scale-105 opacity-50 group-hover:-rotate-1 transition-transform duration-500"></div>
 <img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Analytics and growth" className="relative rounded-2xl shadow-xl object-cover h-[400px] w-full transform group-hover:scale-[1.02] transition-transform duration-500" />
 </div>
 <div className="order-1 md:order-2">
 <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 border border-emerald-100">
 <Activity className="text-emerald-600 w-8 h-8" />
 </div>
 <h3 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">AeroLearn Analytics</h3>
 <p className="text-lg text-gray-600 mb-8 leading-relaxed">
 Visualize your growth. Our smart analytics engine tracks your performance, highlights weak areas, and keeps you motivated.
 </p>
 <ul className="space-y-4 mb-8">
 <li className="flex items-start gap-3"><Check className="text-emerald-600 shrink-0 mt-1" /> <span className="text-gray-700">Gamified streaks and daily quests.</span></li>
 <li className="flex items-start gap-3"><Check className="text-emerald-600 shrink-0 mt-1" /> <span className="text-gray-700">Detailed performance charts by subject.</span></li>
 <li className="flex items-start gap-3"><Check className="text-emerald-600 shrink-0 mt-1" /> <span className="text-gray-700">Earn rewards and top the school leaderboards.</span></li>
 </ul>
 <Link href="/product/analytics" className="inline-flex items-center gap-2 text-emerald-600 font-bold hover:text-emerald-700 hover:gap-3 transition-all">
 Explore AeroLearn Analytics <ChevronRight size={20} />
 </Link>
 </div>
 </div>

 </div>
 </div>
 </section>

 {/* Pricing Section (Clean & Professional) */}
 <section id="pricing" className="py-32 bg-gray-50 border-t border-gray-200">
 <div className="max-w-7xl mx-auto px-6">
 <div className="text-center max-w-3xl mx-auto mb-20">
 <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">Simple, transparent pricing.</h2>
 <p className="text-xl text-gray-600">Invest in your future for less than the cost of a physical textbook.</p>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
 {/* Free Tier */}
 <div className="bg-white rounded-[2rem] p-10 border border-gray-200 shadow-sm flex flex-col hover:shadow-lg transition-shadow">
 <h3 className="text-2xl font-bold text-gray-900 mb-2">Basic</h3>
 <p className="text-gray-500 mb-8">Perfect for exploring the platform.</p>
 <div className="mb-8">
 <span className="text-5xl font-extrabold text-gray-900">Free</span>
 <span className="text-gray-500 font-medium ml-2">forever</span>
 </div>
 <ul className="space-y-5 mb-10 flex-1">
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-gray-400" /> <span className="text-gray-700">Access to 2 subjects</span></li>
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-gray-400" /> <span className="text-gray-700">Limited practice questions</span></li>
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-gray-400" /> <span className="text-gray-700">Standard community support</span></li>
 </ul>
 <Link href="/auth/signup" className="w-full py-4 px-6 text-center rounded-xl font-bold text-gray-900 bg-gray-100 hover:bg-gray-200 transition-colors">
 Get Started Free
 </Link>
 </div>

 {/* Pro Tier */}
 <div className="bg-gray-900 rounded-[2rem] p-10 border border-gray-800 shadow-2xl flex flex-col relative transform md:-translate-y-4 hover:shadow-3xl transition-shadow">
 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest py-1.5 px-4 rounded-full">
 Recommended
 </div>
 <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
 <p className="text-gray-400 mb-8">Everything you need to ace your exams.</p>
 <div className="mb-8">
 <span className="text-5xl font-extrabold text-white">Ôéª2,500</span>
 <span className="text-gray-400 font-medium ml-2">/month</span>
 </div>
 <ul className="space-y-5 mb-10 flex-1">
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-500" /> <span className="text-gray-300">Unlimited access to all subjects</span></li>
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-500" /> <span className="text-gray-300">10,000+ WAEC/JAMB questions</span></li>
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-500" /> <span className="text-gray-300">Advanced Analytics & Mock Exams</span></li>
 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-500" /> <span className="text-gray-300">Priority Support</span></li>
 </ul>
 <Link href="/auth/signup" className="w-full py-4 px-6 text-center rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] hover:-translate-y-1">
 Upgrade to Pro
 </Link>
 </div>
 </div>
 </div>
 </section>

 {/* Corporate Footer */}
 <footer className="bg-white border-t border-gray-200 pt-20 pb-10">
 <div className="max-w-7xl mx-auto px-6">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
 
 <div className="lg:col-span-2">
 <Logo showText={true} />
 <p className="mt-6 text-gray-500 leading-relaxed max-w-sm">
 AeroLearn Technologies Ltd is dedicated to democratizing world-class education for African students through innovative technology.
 </p>
 </div>

 <div>
 <h4 className="font-bold text-gray-900 mb-6 uppercase tracking-wider text-sm">Products</h4>
 <ul className="space-y-4 text-gray-500 text-sm font-medium">
 <li><Link href="/product/learning" className="hover:text-black transition-colors">AeroLearn Core</Link></li>
 <li><Link href="/product/practice" className="hover:text-black transition-colors">AeroLearn Practice</Link></li>
 <li><Link href="/product/analytics" className="hover:text-black transition-colors">AeroLearn Analytics</Link></li>
 <li><Link href="#pricing" className="hover:text-black transition-colors">Pricing</Link></li>
 </ul>
 </div>

 <div>
 <h4 className="font-bold text-gray-900 mb-6 uppercase tracking-wider text-sm">Company</h4>
 <ul className="space-y-4 text-gray-500 text-sm font-medium">
 <li><Link href="/about" className="hover:text-black transition-colors">About Us</Link></li>
 <li><Link href="/careers" className="hover:text-black transition-colors">Careers</Link></li>
 <li><Link href="/blog" className="hover:text-black transition-colors">Blog</Link></li>
 <li><Link href="/contact" className="hover:text-black transition-colors">Contact</Link></li>
 </ul>
 </div>

 <div>
 <h4 className="font-bold text-gray-900 mb-6 uppercase tracking-wider text-sm">Legal</h4>
 <ul className="space-y-4 text-gray-500 text-sm font-medium">
 <li><Link href="/legal/privacy" className="hover:text-black transition-colors">Privacy Policy</Link></li>
 <li><Link href="/legal/terms" className="hover:text-black transition-colors">Terms of Service</Link></li>
 <li><Link href="/legal/cookies" className="hover:text-black transition-colors">Cookie Policy</Link></li>
 </ul>
 </div>

 </div>
 
 <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
 <p className="text-gray-400 text-sm">┬® {new Date().getFullYear()} AeroLearn Technologies Ltd. All rights reserved.</p>
 <p className="text-gray-400 text-sm flex items-center gap-1">Made with <Heart className="w-4 h-4 text-red-500" /> in Nigeria</p>
 </div>
 </div>
 </footer>
 </div>
 )
}

function Heart(props: any) {
 return (
 <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
 <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
 </svg>
 )
}
