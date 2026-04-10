import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex items-center gap-4 py-3.5 sm:py-4">
        <a
          href="#top"
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(37,99,235,0.07)] sm:px-4 sm:py-2"
        >
          <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#2563eb,#60a5fa)]" />
          YW
        </a>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-5 text-sm font-semibold sm:flex">
            <a href="#about" className="nav-link">
              About
            </a>
            <a href="#projects" className="nav-link">
              Projects
            </a>
            <a href="#contact" className="nav-link">
              Contact
            </a>
          </div>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
