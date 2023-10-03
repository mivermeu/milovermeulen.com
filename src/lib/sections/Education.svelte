<script lang='ts'>
    import Card from '$lib/components/Card.svelte';
    import EducationEntry from '$lib/components/EducationEntry.svelte';
    import { bachelor, master, phd } from '$lib/data/education';
</script>

<section>
    <h2>Education</h2>
    <p class='description'>
        I'm passionate about learning and growing, evidenced by an education
        that is as varied as it is extensive. Here is a brief overview of my
        academic achievements, with some light reading in the form of my theses.
    </p>

    <Card additional_class='education-card' details_present={true}>
        <div slot='content'>
            <EducationEntry education={phd} />
        </div>
        <div class='details' slot='details'>
            <EducationEntry education={master} />
            <EducationEntry education={bachelor} />
        </div>
    </Card>
</section>

<style lang='scss'>
    section {
        max-width: 700px;
        margin: auto;
    }

    .description {
        max-width: 500px;
        margin: 0 auto;
        margin-bottom: 1em;
    }
</style>
