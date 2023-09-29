<script lang='ts'>
    import Card from '$lib/components/Card.svelte';
    import CompanyList from '$lib/components/CompanyList.svelte';
    import EducationEntry from '$lib/components/EducationEntry.svelte';
    import { bachelor, master, phd } from '$lib/data/education';
</script>

<h2>Education</h2>

<Card additional_class='education-card' details_present={true}>
    <div slot='content'>
        <EducationEntry education={phd} />
    </div>
    <div class='details' slot='details'>
        <EducationEntry education={master} />
        <EducationEntry education={bachelor} />
    </div>
</Card>

<style lang='scss'>
    :global(.education-card) {
        max-width: 700px;
        margin: auto;
    }
</style>
