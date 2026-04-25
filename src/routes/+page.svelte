<div class="flex h-screen w-screen">
	<aside class="flex w-1/3 flex-col justify-between border-r-2 border-white p-8">
		<div>
			<h1 class="text-4xl font-medium text-white">milo vermeulen</h1>
			<p class="text-sm text-orange-500">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
		</div>

		<nav class="mt-8">
			<ul class="space-y-4">
				<li>
					<a href="#about" class="transition-colors text-white/80 hover:text-white">About</a>
				</li>
				<li>
					<a href="#projects" class="transition-colors text-white/80 hover:text-white">Projects</a>
				</li>
				<li>
					<a href="#experience" class="transition-colors text-white/80 hover:text-white">Experience</a>
				</li>
				<li>
					<a href="#contact" class="transition-colors text-white/80 hover:text-white">Contact</a>
				</li>
			</ul>
		</nav>

		<div class="text-xs text-white/40">
			<p>© {new Date().getFullYear()} Milovermeulen</p>
		</div>
	</aside>

	<main class="w-2/3 overflow-y-auto p-8">
		<section id="about" class="mb-16">
			<h2 class="mb-4 text-2xl font-medium text-white">About</h2>
			<p class="leading-relaxed text-white/70">
				Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
			</p>
		</section>

		<section id="projects" class="mb-16">
			<h2 class="mb-4 text-2xl font-medium text-white">Projects</h2>
			<div class="space-y-6">
				<div class="rounded-lg border border-white/10 p-6">
					<h3 class="mb-2 text-lg font-medium text-white">Project One</h3>
					<p class="text-sm text-white/60">
						Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.
					</p>
				</div>
				<div class="rounded-lg border border-white/10 p-6">
					<h3 class="mb-2 text-lg font-medium text-white">Project Two</h3>
					<p class="text-sm text-white/60">
						Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.
					</p>
				</div>
			</div>
		</section>

		<section id="experience" class="mb-16">
			<h2 class="mb-4 text-2xl font-medium text-white">Experience</h2>
			<div class="space-y-4">
				<div class="border-l-2 border-white/20 pl-4">
					<h3 class="text-lg font-medium text-white">Senior Developer</h3>
					<p class="text-sm text-white/50">Company Name · 2023 - Present</p>
					<p class="mt-2 text-sm text-white/60">
						Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
					</p>
				</div>
				<div class="border-l-2 border-white/20 pl-4">
					<h3 class="text-lg font-medium text-white">Junior Developer</h3>
					<p class="text-sm text-white/50">Another Company · 2021 - 2023</p>
					<p class="mt-2 text-sm text-white/60">
						Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.
					</p>
				</div>
			</div>
		</section>

		<section id="contact">
			<h2 class="mb-4 text-2xl font-medium text-white">Contact</h2>
			<p class="leading-relaxed text-white/70">
				At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.
			</p>
			<p class="mt-4 text-white/60">
				Email: <a href="mailto:hello@example.com" class="text-red-600 hover:underline">hello@example.com</a>
			</p>
		</section>
	</main>
</div>
