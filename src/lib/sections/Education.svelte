<script lang='ts'>
    import CompanyList from '$lib/components/CompanyList.svelte';
    import { bachelor, master, phd } from '$lib/data/education';
    import type { EducationEntry } from '$lib/utils/types';

    let educations: EducationEntry[] = [phd, master, bachelor];
</script>

<h2>Education</h2>
<div class='education-grid'>
    {#each [phd, master, bachelor] as education}
        <div class='education-card'>
            <div class='education-body'>
                <h3>{education.name}</h3>
                <CompanyList companies={education.companies} />
            </div>
            <a href={education.thesis.link}>
                <img class='education-image' src={education.thesis.image} alt={education.thesis.name} />
            </a>
        </div>
    {/each}
</div>

<style lang='scss'>
    .education-grid {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 30px;
    }

    .education-card {
        background-color: var(--color-card);
        border-radius: var(--border-radius-card);
        box-shadow: var(--shadow-card);
        overflow: hidden;

        display: flex;
        flex-direction: row;
    }

    .education-body {
        padding: var(--text-padding-card);
        width: 200px;
    }

    .education-image {
        display: block;
        width: 220px;
        height: 100%;
    }
</style>
