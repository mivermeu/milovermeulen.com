use nalgebra::{Matrix3, Vector3};
use num_complex::Complex64;
use serde::Deserialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const SQRT2: f64 = std::f64::consts::SQRT_2;
const LIGHT_SPEED: f64 = 299_792_458.0; // m/s
const HBAR: f64 = 1.054_571_8e-34; // Js
const REDUCED_FERMI_CONSTANT: f64 = 4.543_795_7e14; // J^-2
const ELECTRON_CHARGE: f64 = 1.602e-19; // C
const NUCLEON_MASS: f64 = 1.6726e-27; // kg

// conversion factor and matter coupling, precomputed once
const CONV: f64 = 1e-6 / ((2.0 * HBAR * LIGHT_SPEED) / ELECTRON_CHARGE);
const GF: f64 = REDUCED_FERMI_CONSTANT * (LIGHT_SPEED * HBAR) * (LIGHT_SPEED * HBAR);

fn iexp(theta: f64) -> Complex64 {
    Complex64::new(theta.cos(), theta.sin())
}

#[derive(Deserialize)]
struct RawParam {
    values: Vec<f64>,
}

#[derive(Deserialize)]
struct Params {
    #[serde(flatten)]
    map: HashMap<String, RawParam>,
}

#[derive(Clone, Copy)]
struct Physics {
    th12: f64,
    th23: f64,
    th13: f64,
    dcp: f64,
    anti: f64,
    dm21: f64,
    dm31: f64,
    l: f64,
    e: f64,
    rho: f64,
}

impl Physics {
    fn pmns(self) -> Matrix3<Complex64> {
        let (s12, c12) = self.th12.sin_cos();
        let (s23, c23) = self.th23.sin_cos();
        let (s13, c13) = self.th13.sin_cos();
        let edcp = iexp(self.anti * self.dcp);
        let emdcp = iexp(-self.anti * self.dcp);

        let u1 = Matrix3::new(
            Complex64::new(1.0, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(c23, 0.0),
            Complex64::new(s23, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(-s23, 0.0),
            Complex64::new(c23, 0.0),
        );
        let u2 = Matrix3::new(
            Complex64::new(c13, 0.0),
            Complex64::new(0.0, 0.0),
            s13 * emdcp,
            Complex64::new(0.0, 0.0),
            Complex64::new(1.0, 0.0),
            Complex64::new(0.0, 0.0),
            -s13 * edcp,
            Complex64::new(0.0, 0.0),
            Complex64::new(c13, 0.0),
        );
        let u3 = Matrix3::new(
            Complex64::new(c12, 0.0),
            Complex64::new(s12, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(-s12, 0.0),
            Complex64::new(c12, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(1.0, 0.0),
        );
        u1 * u2 * u3
    }

    fn transvac(self, nu: usize) -> [f64; 3] {
        let u = self.pmns();
        let hexp = Matrix3::from_diagonal(&Vector3::new(
            Complex64::new(1.0, 0.0),
            iexp(-self.dm21 * 1e-5 * CONV * self.l / self.e),
            iexp(-self.dm31 * 1e-3 * CONV * self.l / self.e),
        ));
        let mut nu_vec = Vector3::zeros();
        nu_vec[nu] = Complex64::new(1.0, 0.0);
        let uhudnu = u * hexp * u.adjoint() * nu_vec;
        [uhudnu[0].norm_sqr(), uhudnu[1].norm_sqr(), uhudnu[2].norm_sqr()]
    }

    fn transmat(self, nu: usize) -> [f64; 3] {
        const N: u32 = 128;

        let h = Matrix3::from_diagonal(&Vector3::new(
            Complex64::new(0.0, 0.0),
            Complex64::new(self.dm21 * 1e-5, 0.0),
            Complex64::new(self.dm31 * 1e-3, 0.0),
        ));
        let ne = self.rho / NUCLEON_MASS / 2.0;
        let v = Matrix3::from_diagonal(&Vector3::new(
            Complex64::new(self.anti * SQRT2 * GF * ne * 1e3, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(0.0, 0.0),
        ));

        let u = self.pmns();
        let mut hexp = Matrix3::identity();
        for j in 1..3 {
            hexp[(j, j)] = iexp(-h[(j, j)].re * CONV * self.l / self.e / f64::from(N));
        }
        let mut vexp = Matrix3::identity();
        vexp[(0, 0)] = iexp(-v[(0, 0)].re * self.l / f64::from(N));

        let hudvupow = mat_pow(hexp * u.adjoint() * vexp * u, N);

        let mut nu_vec = Vector3::zeros();
        nu_vec[nu] = Complex64::new(1.0, 0.0);
        let uhudnu = u * hudvupow * u.adjoint() * nu_vec;
        [uhudnu[0].norm_sqr(), uhudnu[1].norm_sqr(), uhudnu[2].norm_sqr()]
    }
}

fn mat_pow(mut base: Matrix3<Complex64>, mut exp: u32) -> Matrix3<Complex64> {
    let mut result = Matrix3::identity();
    while exp > 0 {
        if exp & 1 == 1 {
            result *= base;
        }
        base = base * base;
        exp >>= 1;
    }
    result
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss, clippy::cast_precision_loss)]
fn run(params: &Params) -> (Vec<f64>, [Vec<f64>; 3]) {
    let get = |k: &str| params.map[k].values[0];

    let range_key = params
        .map
        .iter()
        .find(|(_, p)| p.values.len() > 1)
        .map(|(k, _)| k.as_str())
        .expect("no range parameter defined");
    let start = params.map[range_key].values[0];
    let stop = params.map[range_key].values[1];

    let nsteps = get("nsteps") as usize;
    let nu = get("nu") as usize;
    let use_matter = range_key == "rho" || get("rho") != 0.0;

    let mut phys = Physics {
        th12: get("th12"),
        th23: get("th23"),
        th13: get("th13"),
        dcp: get("dCP"),
        anti: get("anti"),
        dm21: get("Dm21sq"),
        dm31: get("mass_ordering") * get("Dm31sq"),
        l: get("L"),
        e: get("E"),
        rho: get("rho"),
    };

    let mut x = Vec::with_capacity(nsteps + 1);
    let mut pe = Vec::with_capacity(nsteps + 1);
    let mut pmu = Vec::with_capacity(nsteps + 1);
    let mut ptau = Vec::with_capacity(nsteps + 1);

    for i in 0..=nsteps {
        let val = start + (i as f64) * (stop - start) / nsteps as f64;
        match range_key {
            "L" => phys.l = val,
            "E" => phys.e = val,
            "th12" => phys.th12 = val,
            "th23" => phys.th23 = val,
            "th13" => phys.th13 = val,
            "Dm21sq" => phys.dm21 = val,
            "Dm31sq" => phys.dm31 = get("mass_ordering") * val,
            "anti" => phys.anti = val,
            "dCP" => phys.dcp = val,
            "rho" => phys.rho = val,
            _ => {}
        }
        let res = if use_matter {
            phys.transmat(nu)
        } else {
            phys.transvac(nu)
        };
        x.push(val);
        pe.push(res[0]);
        pmu.push(res[1]);
        ptau.push(res[2]);
    }

    (x, [pe, pmu, ptau])
}

/// Computes oscillation probabilities from a JSON-encoded parameter set.
///
/// # Panics
///
/// Panics if `json_params` is not valid JSON or does not contain a range parameter.
#[wasm_bindgen]
#[must_use]
pub fn oscillate(json_params: &str) -> String {
    let params: Params = serde_json::from_str(json_params).expect("failed to parse params");
    let result = run(&params);
    serde_json::to_string(&result).expect("failed to serialize result")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_params() -> String {
        r#"{
            "plot_type": {"values": [0]},
            "nsteps": {"values": [200]},
            "animation_period": {"values": [5]},
            "nu": {"values": [1]},
            "anti": {"values": [1]},
            "mass_ordering": {"values": [1]},
            "E": {"values": [1]},
            "L": {"values": [0, 33060]},
            "th12": {"values": [0.5843]},
            "th23": {"values": [0.738]},
            "th13": {"values": [0.148]},
            "Dm21sq": {"values": [7.5]},
            "Dm31sq": {"values": [2.457]},
            "dCP": {"values": [-1.9477874452256714]},
            "rho": {"values": [0]}
        }"#
        .to_string()
    }

    #[test]
    fn probabilities_sum_to_one() {
        let params: Params = serde_json::from_str(&sample_params()).unwrap();
        let (x, y) = run(&params);
        assert_eq!(x.len(), 201);
        assert_eq!(y[0].len(), x.len());
        for (i, ((pe, pmu), ptau)) in y[0].iter().zip(&y[1]).zip(&y[2]).enumerate() {
            let sum = pe + pmu + ptau;
            assert!((sum - 1.0).abs() < 1e-5, "sum = {sum} at {i}");
        }
    }

    #[test]
    fn matter_changes_probabilities() {
        let mut matter: Params = serde_json::from_str(&sample_params()).unwrap();
        matter.map.get_mut("rho").unwrap().values = vec![2600.0];
        let vac: Params = serde_json::from_str(&sample_params()).unwrap();
        let (_, y_vac) = run(&vac);
        let (_, y_mat) = run(&matter);
        let any_diff = y_vac
            .iter()
            .zip(y_mat.iter())
            .any(|(a, b)| a.iter().zip(b.iter()).any(|(p, q)| (p - q).abs() > 1e-10));
        assert!(any_diff);
    }
}
