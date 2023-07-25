<script lang='ts'>
    import { educations } from '$lib/data/education';
    import type { Company } from '$lib/utils/types';

    function print_company(company: Company): string {
        return company.name + ' in ' + company.location.city + ' (' + company.location.country + ')';
    }

    function list_companies(companies: Company[]): string {
        if(companies.length == 0) {
            return '';
        } else if(companies.length == 1) {
            return print_company(companies[0]);
        } else {
            return companies.map(print_company).slice(0, -1).join(', ') + ' and ' + print_company(companies[companies.length - 1])
        }
    }
</script>

<h2>Education</h2>
{#each educations as education}
    <p>I did a {education.name} at {list_companies(education.companies)} between {education.start.getFullYear()} and {education.stop?.getFullYear()}.</p>
    <p>My thesis was called "{education.thesis.name}"</p>
    <br>
{/each}
