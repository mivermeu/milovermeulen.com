import { sin, type Complex, type Matrix, cos, exp, complex, matrix, multiply, conj, transpose, re, dotMultiply, pow, add, expm, pi } from 'mathjs';
import type { OscillationParameters, Parameter } from './types';


const sqrt2 = Math.sqrt(2);
const light_speed: number = 299792458; // In m/s.
const hbar: number = 1.0545718e-34; // In Js.
const reduced_fermi_constant: number = 4.5437957e14; // In J^-2.
const electron_charge: number = 1.602e-19; // In C.
const nucleon_mass: number = 1.6726e-27; // In kg.

const conv: number = 1e-6 / ((2 * hbar * light_speed) / electron_charge); // Conversion factor from natural to useful units.
const Gf: number = reduced_fermi_constant * Math.pow(light_speed * hbar, 2); // In m^2.


export class Oscillator {
    // Set some dummy initial values to satisfy the type checker that will immediately be overwritten by the constructor.
    parameters: OscillationParameters;
    private chirality: number;
    U1: Matrix;
    U2: Matrix;
    U3: Matrix;
    U: Matrix;
    Ud: Matrix;
    V: Matrix;
    H: Matrix;
    Hexp: Matrix;
    private edcp: Complex;
    private emdcp: Complex;

    parameter_to_update_function: Map<string, (newval: number) => void> = new Map([
        ['L', this.update_L],
        ['E', this.update_E],
        ['th12', this.update_th12],
        ['th23', this.update_th23],
        ['th13', this.update_th13],
        ['Dm21sq', this.update_Dm21sq],
        ['Dm31sq', this.update_Dm31sq],
        ['anti', this.update_anti],
        ['dCP', this.update_dCP],
        ['rho', this.update_rho],
    ]);

    // When set to true, the much more expensive Padé approximation to the
    // matrix exponential is used in the oscillation calculation.
    // Otherwise, the Lie product formula is used to speed up the calculation. 
    use_exp: boolean = false;

    constructor(parameters: OscillationParameters) {
        // Save a copy of the parameter set and determine matrices for the first point in the simulation.
        this.parameters = parameters;

        const s12 = sin(this.parameters.th12.values[0]);
        const s23 = sin(this.parameters.th23.values[0]);
        const c12 = cos(this.parameters.th12.values[0]);
        const c23 = cos(this.parameters.th23.values[0]);
        const c13 = cos(this.parameters.th13.values[0]);
        const s13 = sin(this.parameters.th13.values[0]);

        this.chirality = this.parameters.anti.values[0];

        this.edcp = exp(complex(0, this.chirality * this.parameters.dCP.values[0]));
        this.emdcp = exp(complex(0, -1 * this.chirality * this.parameters.dCP.values[0]));

        // Construct oscillation matrix.
        this.U1 = matrix([
            [1, 0, 0],
            [0, c23, s23],
            [0, -s23, c23]
        ]);

        // @ts-ignore: Multiplication result in matrix
        this.U2 = matrix([
            [c13, 0, multiply(s13, this.emdcp)],
            [0, 1, 0],
            [multiply(-s13, this.edcp), 0, c13]
        ]);

        this.U3 = matrix([
            [c12, s12, 0],
            [-s12, c12, 0],
            [0, 0, 1]
        ]);

        // @ts-ignore: Multiple multiplication
        this.U = multiply(this.U1, this.U2, this.U3);
        this.Ud = conj(transpose(this.U));

        // Hamiltonian.
        this.H = matrix([
            [0, 0, 0],
            [0, this.parameters.Dm21sq.values[0] * 1e-5, 0],
            [0, 0, this.parameters.Dm31sq.values[0] * 1e-3]
        ]);
        this.Hexp = matrix([
            [1, 0, 0],
            [0, exp(complex(0, (-this.parameters.Dm21sq.values[0] * 1e-5 * conv * this.parameters.L.values[0]) / this.parameters.E.values[0])), 0],
            [0, 0, exp(complex(0, (-this.parameters.Dm31sq.values[0] * 1e-3 * conv * this.parameters.L.values[0]) / this.parameters.E.values[0]))]
        ]);

        const Ne = this.parameters.rho.values[0] / nucleon_mass / 2; // Electron number density in m^-3.
        this.V = matrix([
            [this.chirality * sqrt2 * Gf * Ne * 1e3, 0, 0], // Multiply and convert to km^-1.
            [0, 0, 0],
            [0, 0, 0]
        ]);
    }

    update(key: string, newval: number): void {
        const update_function: ((newval: number) => void) | undefined = this.parameter_to_update_function.get(key)?.bind(this);
        if(update_function) {
            update_function(newval);
        }
    }

    update_L(newval: number): void {
        this.Hexp.set([1, 1],
            exp(complex(0,(-this.parameters.Dm21sq.values[0] * 1e-5 * conv * newval) / this.parameters.E.values[0])));
        this.Hexp.set([2, 2],
            exp(complex(0, (-this.parameters.Dm31sq.values[0] * 1e-3 * conv * newval) / this.parameters.E.values[0])));
    }

    update_E(newval: number): void {
        this.Hexp.set([1, 1],
            exp(complex(0,(-this.parameters.Dm21sq.values[0] * 1e-5 * conv * this.parameters.L.values[0]) / newval)));
        this.Hexp.set([2, 2],
            exp(complex(0, (-this.parameters.Dm31sq.values[0] * 1e-3 * conv * this.parameters.L.values[0]) / newval)));
    }

    update_th12(newval: number): void {
        const s12 = sin(newval);
        const c12 = cos(newval);
        this.U3.set([0, 0], c12);
        this.U3.set([1, 1], c12);
        this.U3.set([0, 1], s12);
        this.U3.set([1, 0], -s12);
        // @ts-ignore: Multiple multiplication
        this.U = multiply(this.U1, this.U2, this.U3);
        this.Ud = conj(transpose(this.U));
    }

    update_th23(newval: number): void {
        const s23 = sin(newval);
        const c23 = cos(newval);
        this.U1.set([1, 1], c23);
        this.U1.set([1, 2], s23);
        this.U1.set([2, 2], c23);
        this.U1.set([2, 1], -s23);
        // @ts-ignore: Multiple multiplication
        this.U = multiply(this.U1, this.U2, this.U3);
        this.Ud = conj(transpose(this.U));
    }

    update_th13(newval: number): void {
        const s13 = sin(newval);
        const c13 = cos(newval);
        this.U2.set([0, 0], c13);
        this.U2.set([2, 2], c13);
        this.U2.set([0, 2], multiply(s13, this.emdcp));
        this.U2.set([2, 0], multiply(-s13, this.edcp));
        // @ts-ignore: Multiple multiplication
        this.U = multiply(this.U1, this.U2, this.U3);
        this.Ud = conj(transpose(this.U));
    }

    update_Dm21sq(newval: number): void {
        this.H.set([1, 1], this.parameters.Dm21sq.values[0] * 1e-5);
        this.Hexp.set([1, 1],
            exp(complex(0, (-this.parameters.Dm21sq.values[0] * 1e-5 * conv * this.parameters.L.values[0]) / this.parameters.E.values[0])));
    }

    update_Dm31sq(newval: number): void {
        this.H.set([2, 2], this.parameters.Dm31sq.values[0] * 1e-3);
        this.Hexp.set([2, 2],
            exp(complex(0, (-this.parameters.Dm31sq.values[0] * 1e-3 * conv * this.parameters.L.values[0]) / this.parameters.E.values[0])));
    }

    update_anti(newval: number): void {
        this.chirality = newval;
        this.update_dCP(this.parameters.dCP.values[0]);
        this.update_rho(this.parameters.rho.values[0]);
    }

    update_dCP(newval: number): void {
        const sin13 = sin(this.parameters.th13.values[0]);
        this.edcp = exp(complex(0, this.chirality * newval));
        this.emdcp = exp(complex(0, -1 * this.chirality * newval));
        this.U2.set([0, 2], multiply(sin13, this.emdcp));
        this.U2.set([2, 0], multiply(-sin13, this.edcp));
        // @ts-ignore: Multiple multiplication
        this.U = multiply(this.U1, this.U2, this.U3);
        this.Ud = conj(transpose(this.U));
    }

    update_rho(newval: number): void {
        const Ne = newval / nucleon_mass / 2; // Electron number density in m^-3.
        this.V.set([0, 0], this.chirality * sqrt2 * Gf * Ne * 1e3);
    }

    oscillate(new_parameters: OscillationParameters | undefined = undefined): [number[], number[][]] {
        // Given the internal oscillation parameters, return a tuple containing
        // the range values and the three neutrino probability values over that
        // range.
        if(new_parameters) {
            for(let [key, par] of Object.entries(new_parameters)) {
                if(this.parameters[key].values[0] != par.values[0] && this.parameters[key].values.length == 1) {
                    const update_function: ((newval: number) => void) | undefined = this.parameter_to_update_function.get(key)?.bind(this);
                    if(update_function) {
                        update_function(par.values[0]);
                    }
                }
            }
            this.parameters = structuredClone(new_parameters);
        }
        
        // Find the range parameter and key.
        let range_key_parameter: [string, Parameter] | undefined =
        Object.entries(this.parameters).find((key_val: [string, Parameter]) => key_val[1].values.length > 1);
        if(!range_key_parameter) {
            throw new Error('No range parameter defined in parameters ' + this.parameters)
        }
        let [range_key, range_parameter] = range_key_parameter;
        
        const range_start: number = range_parameter.values[0];
        const range_stop: number = range_parameter.values[1];

        // Get the x values of the oscillation.
        // @ts-ignore: No complex values in range.
        let range_values: number[] = Array.from(
            { length: this.parameters.nsteps.values[0] + 1 },
            (_, index) => range_start + (index * (range_stop - range_start)) / this.parameters.nsteps.values[0]
        );

        // Determine what oscillation function to use based on the given parameters and options.
        let oscillation_function: () => [number, number, number];
        if (this.parameters.rho.values.length > 1 || this.parameters.rho.values[0] != 0) {
            oscillation_function = this.use_exp ? this.transmatexp.bind(this) : this.transmat.bind(this);
        } else {
            oscillation_function = this.transvac.bind(this);
        }

        // Determine the update function to be called for the range calculation.
        const range_update_function: ((newval: number) => void) | undefined = this.parameter_to_update_function.get(range_key)?.bind(this);
        if(!range_update_function) {
            throw new Error(`Could not find key ${range_key} in update function map.`)
        }

        // Determine the neutrino oscillation probabilities at each point in the range.
        let nu_values: [number[], number[], number[]] = [Array(range_values.length), Array(range_values.length), Array(range_values.length)];
        for(let i = 0; i < range_values.length; i++) {
            // Set the range parameter to the current x value.
            range_parameter.values = [range_values[i]];
            range_update_function(range_values[i]);
            const [nue, numu, nutau] = oscillation_function();
            nu_values[0][i] = nue;
            nu_values[1][i] = numu;
            nu_values[2][i] = nutau;
        }
        // Change the range parameter's value back to its original range.
        range_parameter.values = [range_start, range_stop];

        return [range_values, nu_values];
    }

    private transvac(): [number, number, number] {
        let nu: [number, number, number] = [0, 0, 0];
        nu[this.parameters.nu.values[0]] = 1;
        // @ts-ignore: Multiple multiplication
        const UHUdnu: Matrix = multiply(this.U, this.Hexp, this.Ud, nu);
        // @ts-ignore
        const result: [number, number, number] = re(dotMultiply(UHUdnu, conj(UHUdnu))).valueOf();
        return result;
    }

    private transmat(): [number, number, number] {
        let nu: [number, number, number] = [0, 0, 0];
        nu[this.parameters.nu.values[0]] = 1;
    
        const N = 128; // Large enough N for Lie product formula.
        // Temporary Hamiltonian to component-wise exponentiate.
        let Hexp: Matrix = matrix([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
        for (var j = 1; j < 3; ++j) {
            Hexp.set([j, j], exp(complex(0, (-this.H.get([j, j]) * conv * this.parameters.L.values[0]) / this.parameters.E.values[0] / N)));
        }
        let Vexp = matrix([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
        Vexp.set([0, 0], exp(complex(0, (-this.V.get([0, 0]) * this.parameters.L.values[0]) / N)));
        // Slow matrix power. Better than exponential...
        // @ts-ignore: Multiple multiplication
        const HUdVUpow = pow(multiply(Hexp, this.Ud, Vexp, this.U), N);
        // @ts-ignore: Multiple multiplication
        const UHUdnu = multiply(this.U, HUdVUpow, this.Ud, nu);
        // @ts-ignore
        return re(dotMultiply(UHUdnu, conj(UHUdnu))).valueOf();
    }
    
    private transmatexp(): [number, number, number] {
        let nu: [number, number, number] = [0, 0, 0];
        nu[this.parameters.nu.values[0]] = 1;
    
        // @ts-ignore: Multiple multiplication
        const Htmp = multiply(complex(0, -1), this.H, (conv * this.parameters.L.values[0]) / this.parameters.E.values[0]);
        // @ts-ignore: Multiple multiplication
        const Vtmp = multiply(complex(0, -1), this.V, this.parameters.L.values[0]);
        // @ts-ignore: Multiple multiplication
        const Hmat = add(Htmp, multiply(this.Ud, Vtmp, this.U));
        // @ts-ignore: Multiple multiplication
        const UHUdnu = multiply(this.U, expm(Hmat), this.Ud, nu);
        // @ts-ignore
        return re(dotMultiply(UHUdnu, conj(UHUdnu))).valueOf();
    }
}
