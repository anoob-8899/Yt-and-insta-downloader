"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full bg-[#F7F8F4] border-b border-[#DCDDD8]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        {/* MEDIAFLOW Logo */}
        <Link href="/" className="flex items-center">
          <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
            MEDIAFLOW
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#6B6B67]">
          <Link href="/" className="hover:text-[#111111] transition-colors">
            Home
          </Link>
          <Link href="#how-it-works" className="hover:text-[#111111] transition-colors">
            How it works
          </Link>
          <Link href="#supported-platforms" className="hover:text-[#111111] transition-colors">
            Supported
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-[#111111] rounded hover:bg-black/5"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#F7F8F4] border-b border-[#DCDDD8] px-4 py-4 space-y-3 font-medium text-[#6B6B67]">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-[#111111] py-1"
          >
            Home
          </Link>
          <Link
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block hover:text-[#111111] py-1"
          >
            How it works
          </Link>
          <Link
            href="#supported-platforms"
            onClick={() => setMobileMenuOpen(false)}
            className="block hover:text-[#111111] py-1"
          >
            Supported
          </Link>
        </div>
      )}
    </header>
  );
}
