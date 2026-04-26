<script>
	import { bachelor, master, phd } from "$lib/data/education";
	import { month_plus_year } from "$lib/utils/datetime";

</script>
<section id="education" class="mb-16">
    <h2 class="mb-4 text-2xl font-medium text-white">education</h2>
    <div class="space-y-4">
        {#each [phd, master, bachelor] as education, index (index)}
            <div class="border-l-2 border-white/20 pl-4">
                <h3 class="text-lg font-medium text-white">{education.name.toLowerCase()}</h3>
                <p class="text-sm text-white/50">{education.companies.map( x => x.name).join(" / ")} · {month_plus_year(education.start)} - {month_plus_year(education.stop)}</p>
                <p class="mt-2 text-sm text-white/60">{education.description}</p>
            </div>
        {/each}
    </div>
</section>
