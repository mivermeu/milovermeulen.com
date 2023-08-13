<!-- String multiple CompanyBadges together to make a list that does not break
    in weird places. -->

<script lang='ts'>
    import CompanyBadge from "./CompanyBadge.svelte";
    import type { Company } from "$lib/utils/types";

    export let companies: Company[] = []
</script>

<div class='badge-container'>
    {#each companies as company}
        <CompanyBadge {company} />
    {/each}
</div>

<style lang='scss'>
    .badge-container {
        display: flex;
        flex-wrap: wrap;
    }
</style>
