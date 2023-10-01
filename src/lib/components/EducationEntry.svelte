<script lang='ts'>
    import type { EducationEntry } from '$lib/utils/types';
    import CompanyList from './CompanyList.svelte';

    export let education: EducationEntry;

</script>

<div class='content'>
    <div class='content-text'>
        <h3>{education.name}</h3>
        <CompanyList companies={education.companies} />
        <p>{education.description}</p>
    </div>
    <div class='thesis-container'>
        <a href={education.thesis.link} target='_blank' on:click|stopPropagation>
            <img class='education-image' src={education.thesis.image} alt={education.thesis.name} />
        </a>
    </div>
</div>

<style lang='scss'>
    .content {
        display: flex;
        margin-bottom: 1.5em;

        @media screen and (max-width: 550px) {
            flex-direction: column;
        }
    }

    .thesis-container {
        margin: auto;
    }

    .education-image {
        display: block;
        width: 210px;
        height: 300px;

        transition: 0.2s;
        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);

        &:hover {
            translate: var(--shadow-opposite-translation);
            filter: var(--shadow);
        }
    }
</style>