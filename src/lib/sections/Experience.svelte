<script lang='ts'>
    import { jobs } from '$lib/data/experience';
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

<h2>Experience</h2>
{#each jobs as job}
    <p>I was a {job.title} at {list_companies(job.companies)} between {job.start.getFullYear()} and {job.stop?.getFullYear()}.</p>
    <br>
{/each}
