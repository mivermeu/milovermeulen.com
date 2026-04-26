<aside class="h-full flex flex-col justify-between">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-white">milo vermeulen</h1>
        <p class="text-sm text-orange-500">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <nav class="mt-8">
        <ul class="space-y-6">
            {#each ['about', 'projects', 'experience', 'contact'] as section, index (index)}
                <li>
                    <div class="flex items-center align-middle gap-4">
                        <div class="h-2 w-2 bg-black rounded-full"></div>
                        <a href="#{section}" class="transition-colors text-white/80 hover:text-white">{section}</a>
                    </div>
                </li>
            {/each}
        </ul>
    </nav>

    <div class="text-xs text-white/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
