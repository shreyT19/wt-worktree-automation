import Link from "next/link";

const GITHUB_URL = "https://github.com/shreyT19/git-wt";

const INSTALL_CMD = `git clone https://github.com/shreyT19/git-wt ~/tools/wt
cd ~/tools/wt
./install.sh`;

const QUICK_START_CMD = `wt init          # generate .worktreerc
wt add my-feat   # create your first worktree`;

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-mono font-bold text-white text-lg tracking-tight">
          wt
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Docs
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            GitHub
          </a>
          <Link
            href="/docs"
            className="text-sm bg-white text-zinc-950 px-3 py-1.5 rounded-md font-medium hover:bg-zinc-100 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-14 bg-zinc-950 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(120,119,198,0.15),transparent)]" />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="animate-fade-in inline-flex items-center gap-2 border border-white/10 rounded-full px-3 py-1 text-xs text-zinc-400 mb-8">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Open source — MIT License
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-up delay-100 text-5xl md:text-7xl font-bold text-white leading-tight tracking-tight mb-6">
          Stop wasting time<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">
            setting up worktrees
          </span>
        </h1>

        {/* Subline */}
        <p className="animate-fade-in-up delay-200 text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          <code className="font-mono text-white">wt</code> auto-installs dependencies and wires up{" "}
          <code className="font-mono text-white">.env</code> files every time you create a git worktree.
          One command, ready to code.
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/docs"
            className="inline-flex items-center justify-center gap-2 bg-white text-zinc-950 px-6 py-3 rounded-lg font-semibold hover:bg-zinc-100 transition-colors"
          >
            Get Started
            <span aria-hidden>→</span>
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 border border-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:border-white/40 hover:bg-white/5 transition-colors"
          >
            View on GitHub
          </a>
        </div>

        {/* Terminal demo */}
        <div className="animate-fade-in-up delay-400 mx-auto max-w-2xl rounded-xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-zinc-900/50">
            <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span className="ml-3 text-xs text-zinc-500 font-mono">zsh</span>
          </div>
          {/* Terminal content */}
          <div className="p-5 font-mono text-sm text-left space-y-1">
            <div className="terminal-line-1 text-zinc-300">
              <span className="text-emerald-400">$</span> wt add feat-billing
            </div>
            <div className="terminal-line-2 text-zinc-500 text-xs pt-1">
              Creating worktree for branch &apos;shreyansh/feat-billing&apos;
            </div>
            <div className="terminal-line-3 text-zinc-500 text-xs pl-2">
              path: ../worktrees/myapp-feat-billing
            </div>
            <div className="pt-2">
              <div className="terminal-line-4 text-zinc-300 text-xs">
                <span className="text-zinc-500">[1/4]</span> Creating worktree{" "}
                <span className="text-zinc-600">........................</span>{" "}
                <span className="text-emerald-400">done</span>{" "}
                <span className="text-zinc-600">(312ms)</span>
              </div>
              <div className="terminal-line-5 text-zinc-300 text-xs">
                <span className="text-zinc-500">[2/4]</span> Detecting project type{" "}
                <span className="text-zinc-600">..................</span>{" "}
                <span className="text-cyan-400">node(bun), python(uv)</span>{" "}
                <span className="text-zinc-600">(28ms)</span>
              </div>
              <div className="terminal-line-6 text-zinc-300 text-xs">
                <span className="text-zinc-500">[3/4]</span> Installing dependencies{" "}
                <span className="text-zinc-600">.................</span>{" "}
                <span className="text-emerald-400">done</span>{" "}
                <span className="text-zinc-600">(8.4s)</span>
              </div>
              <div className="terminal-line-7 text-zinc-300 text-xs">
                <span className="text-zinc-500">[4/4]</span> Setting up env files{" "}
                <span className="text-zinc-600">....................</span>{" "}
                <span className="text-emerald-400">2 files</span>{" "}
                <span className="text-zinc-600">(11ms)</span>
              </div>
            </div>
            <div className="terminal-line-8 pt-3 text-zinc-300 text-xs">
              Worktree ready at:{" "}
              <span className="text-cyan-400">/Users/dev/worktrees/myapp-feat-billing</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSolutionSection() {
  return (
    <section className="bg-zinc-950 py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Git worktrees are great. The setup is not.
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Every time you create a worktree, you start over. <code className="text-white font-mono">wt</code> fixes that.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* Before */}
          <div className="rounded-xl border border-red-500/20 bg-zinc-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-red-500/20 bg-red-500/5">
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Before — without wt</span>
            </div>
            <pre className="p-5 font-mono text-sm text-zinc-500 overflow-x-auto leading-relaxed">
              <code>{`$ git worktree add \\
    ../feat ../feat-billing
$ cd ../feat-billing
$ bun install
# wait 2+ minutes...
$ cp ../.env .env
$ cp ../.env.local .env.local
$ bun run codegen
$ python manage.py migrate
# finally ready...`}</code>
            </pre>
            <div className="px-4 py-3 border-t border-red-500/20 bg-red-500/5">
              <span className="text-xs text-red-400">8 commands, 2+ minutes, error-prone</span>
            </div>
          </div>

          {/* After */}
          <div className="rounded-xl border border-emerald-500/20 bg-zinc-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-emerald-500/20 bg-emerald-500/5">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">After — with wt</span>
            </div>
            <pre className="p-5 font-mono text-sm text-zinc-300 overflow-x-auto leading-relaxed">
              <code>{`$ wt add feat-billing




Worktree ready at:
  ~/worktrees/myapp-feat-billing

cd into it:
  cd ~/worktrees/...`}</code>
            </pre>
            <div className="px-4 py-3 border-t border-emerald-500/20 bg-emerald-500/5">
              <span className="text-xs text-emerald-400">1 command, seconds, every time</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    title: "Cross-ecosystem detection",
    description: "Automatically detects Node.js, Python, Rust, and Go. Picks the right package manager from lockfiles — bun, pnpm, yarn, uv, poetry, cargo, and more.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    title: ".env file management",
    description: "Symlink or copy .env files into every new worktree. Configure per-file strategies, exclusions, and always-copy overrides. Never set up secrets manually again.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.169.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-1.586.286" />
      </svg>
    ),
    title: "Claude Code integration",
    description: "Ships two hooks for Claude Code. New worktrees auto-configure when Claude creates them. Fully set up before Claude's next step, without any manual intervention.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Smart defaults + .worktreerc",
    description: "Commit a .worktreerc alongside your code. Every developer on the team gets identical setup behavior automatically. Override anything with per-repo config.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
    title: "Full worktree lifecycle",
    description: "wt add, list, remove, cd, init, and doctor. Fuzzy branch matching, uncommitted change protection, and a diagnostic checklist to find setup issues fast.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
      </svg>
    ),
    title: "Shell completions",
    description: "First-class zsh and bash completions. Tab-complete branch names, command flags, and subcommands. The installer sets it up automatically.",
  },
];

function FeaturesSection() {
  return (
    <section className="bg-zinc-900 py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Everything you need
          </h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            From first worktree to team-wide adoption — wt has you covered.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-white/10 bg-zinc-950 p-6 hover:border-white/20 hover:bg-zinc-900 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-4 group-hover:bg-violet-500/15 transition-colors">
                {feature.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InstallSection() {
  return (
    <section className="bg-zinc-950 py-24 px-6">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Get started in seconds
        </h2>
        <p className="text-zinc-400 text-lg mb-12">
          Prerequisites: <code className="text-white font-mono">bun</code> &ge; 1.0 and{" "}
          <code className="text-white font-mono">git</code> &ge; 2.5
        </p>

        <div className="space-y-6 text-left">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Install</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
              <pre className="p-5 font-mono text-sm text-zinc-300 overflow-x-auto leading-relaxed">
                <code>{INSTALL_CMD}</code>
              </pre>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Then in any git repo</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
              <pre className="p-5 font-mono text-sm text-zinc-300 overflow-x-auto leading-relaxed">
                <code>{QUICK_START_CMD}</code>
              </pre>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/docs/installation"
            className="inline-flex items-center justify-center gap-2 border border-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:border-white/40 hover:bg-white/5 transition-colors"
          >
            Full installation guide
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-violet-500 transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}

const ecosystems = [
  { name: "bun", color: "text-pink-400", bg: "bg-pink-400/10 border-pink-400/20" },
  { name: "npm", color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  { name: "pnpm", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  { name: "yarn", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
  { name: "uv", color: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20" },
  { name: "pip", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
  { name: "poetry", color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/20" },
  { name: "cargo", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" },
  { name: "go mod", color: "text-sky-400", bg: "bg-sky-400/10 border-sky-400/20" },
];

function EcosystemSection() {
  return (
    <section className="bg-zinc-900 py-20 px-6 border-y border-white/5">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-white mb-3">
          Works with your stack
        </h2>
        <p className="text-zinc-400 mb-10">
          Auto-detected from lockfiles and project markers. No configuration needed.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {ecosystems.map((eco) => (
            <span
              key={eco.name}
              className={`inline-flex items-center border rounded-lg px-4 py-2 font-mono text-sm font-medium ${eco.color} ${eco.bg}`}
            >
              {eco.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-zinc-950 border-t border-white/10 py-12 px-6">
      <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <span className="font-mono font-bold text-white">wt</span>
          <span className="text-zinc-600 text-sm">MIT License</span>
        </div>
        <div className="flex items-center gap-8 text-sm text-zinc-500">
          <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
          <Link href="/docs/installation" className="hover:text-white transition-colors">Installation</Link>
          <Link href="/docs/configuration" className="hover:text-white transition-colors">Configuration</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className="bg-zinc-950">
      <Navbar />
      <HeroSection />
      <ProblemSolutionSection />
      <FeaturesSection />
      <EcosystemSection />
      <InstallSection />
      <Footer />
    </div>
  );
}
