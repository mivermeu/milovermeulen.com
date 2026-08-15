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

fn conv() -> f64 {
    1e-6 / ((2.0 * HBAR * LIGHT_SPEED) / ELECTRON_CHARGE)
}

fn gf() -> f64 {
    REDUCED_FERMI_CONSTANT * (LIGHT_SPEED * HBAR).powi(2)
}

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

struct Oscillator {
    current: HashMap<String, f64>,
    chirality: f64,
    edcp: Complex64,
    emdcp: Complex64,
    u1: Matrix3<Complex64>,
    u2: Matrix3<Complex64>,
    u3: Matrix3<Complex64>,
    u: Matrix3<Complex64>,
    ud: Matrix3<Complex64>,
    v: Matrix3<Complex64>,
    h: Matrix3<Complex64>,
    hexp: Matrix3<Complex64>,
}

impl Oscillator {
    #[allow(clippy::similar_names, clippy::many_single_char_names)]
    fn build(current: HashMap<String, f64>) -> Self {
        let th12 = current["th12"];
        let th23 = current["th23"];
        let th13 = current["th13"];
        let dcp = current["dCP"];
        let anti = current["anti"];
        let dm21 = current["Dm21sq"];
        let dm31 = current["Dm31sq"];
        let l = current["L"];
        let e = current["E"];
        let rho = current["rho"];

        let chirality = anti;
        let edcp = iexp(chirality * dcp);
        let emdcp = iexp(-chirality * dcp);

        let s12 = th12.sin();
        let s23 = th23.sin();
        let c12 = th12.cos();
        let c23 = th23.cos();
        let c13 = th13.cos();
        let s13 = th13.sin();

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

        let u = u1 * u2 * u3;
        let ud = u.adjoint();

        let h = Matrix3::from_diagonal(&Vector3::new(
            Complex64::new(0.0, 0.0),
            Complex64::new(dm21 * 1e-5, 0.0),
            Complex64::new(dm31 * 1e-3, 0.0),
        ));
        let hexp = Matrix3::from_diagonal(&Vector3::new(
            Complex64::new(1.0, 0.0),
            iexp(-dm21 * 1e-5 * conv() * l / e),
            iexp(-dm31 * 1e-3 * conv() * l / e),
        ));
        let ne = rho / NUCLEON_MASS / 2.0;
        let v = Matrix3::from_diagonal(&Vector3::new(
            Complex64::new(chirality * SQRT2 * gf() * ne * 1e3, 0.0),
            Complex64::new(0.0, 0.0),
            Complex64::new(0.0, 0.0),
        ));

        Oscillator {
            current,
            chirality,
            edcp,
            emdcp,
            u1,
            u2,
            u3,
            u,
            ud,
            v,
            h,
            hexp,
        }
    }

    fn rebuild_u(&mut self) {
        self.u = self.u1 * self.u2 * self.u3;
        self.ud = self.u.adjoint();
    }

    fn apply(&mut self, key: &str, x: f64) {
        match key {
            "L" => self.update_l(x),
            "E" => self.update_e(x),
            "th12" => self.update_th12(x),
            "th23" => self.update_th23(x),
            "th13" => self.update_th13(x),
            "Dm21sq" => self.update_dm21sq(x),
            "Dm31sq" => self.update_dm31sq(x),
            "anti" => self.update_anti(x),
            "dCP" => self.update_dcp(x),
            "rho" => self.update_rho(x),
            _ => {}
        }
        self.current.insert(key.to_string(), x);
    }

    fn update_l(&mut self, x: f64) {
        let dm21 = self.current["Dm21sq"];
        let dm31 = self.current["Dm31sq"];
        let e = self.current["E"];
        self.hexp[(1, 1)] = iexp(-dm21 * 1e-5 * conv() * x / e);
        self.hexp[(2, 2)] = iexp(-dm31 * 1e-3 * conv() * x / e);
    }

    fn update_e(&mut self, x: f64) {
        let dm21 = self.current["Dm21sq"];
        let dm31 = self.current["Dm31sq"];
        let l = self.current["L"];
        self.hexp[(1, 1)] = iexp(-dm21 * 1e-5 * conv() * l / x);
        self.hexp[(2, 2)] = iexp(-dm31 * 1e-3 * conv() * l / x);
    }

    fn update_th12(&mut self, x: f64) {
        let s12 = x.sin();
        let c12 = x.cos();
        self.u3[(0, 0)] = Complex64::new(c12, 0.0);
        self.u3[(1, 1)] = Complex64::new(c12, 0.0);
        self.u3[(0, 1)] = Complex64::new(s12, 0.0);
        self.u3[(1, 0)] = Complex64::new(-s12, 0.0);
        self.rebuild_u();
    }

    fn update_th23(&mut self, x: f64) {
        let s23 = x.sin();
        let c23 = x.cos();
        self.u1[(1, 1)] = Complex64::new(c23, 0.0);
        self.u1[(1, 2)] = Complex64::new(s23, 0.0);
        self.u1[(2, 2)] = Complex64::new(c23, 0.0);
        self.u1[(2, 1)] = Complex64::new(-s23, 0.0);
        self.rebuild_u();
    }

    fn update_th13(&mut self, x: f64) {
        let s13 = x.sin();
        let c13 = x.cos();
        self.u2[(0, 0)] = Complex64::new(c13, 0.0);
        self.u2[(2, 2)] = Complex64::new(c13, 0.0);
        self.u2[(0, 2)] = s13 * self.emdcp;
        self.u2[(2, 0)] = -s13 * self.edcp;
        self.rebuild_u();
    }

    fn update_dm21sq(&mut self, x: f64) {
        let l = self.current["L"];
        let e = self.current["E"];
        self.h[(1, 1)] = Complex64::new(x * 1e-5, 0.0);
        self.hexp[(1, 1)] = iexp(-x * 1e-5 * conv() * l / e);
    }

    fn update_dm31sq(&mut self, x: f64) {
        let l = self.current["L"];
        let e = self.current["E"];
        self.h[(2, 2)] = Complex64::new(x * 1e-3, 0.0);
        self.hexp[(2, 2)] = iexp(-x * 1e-3 * conv() * l / e);
    }

    fn update_anti(&mut self, x: f64) {
        self.chirality = x;
        let dcp = self.current["dCP"];
        self.update_dcp(dcp);
        let rho = self.current["rho"];
        self.update_rho(rho);
    }

    fn update_dcp(&mut self, x: f64) {
        let sin13 = self.current["th13"].sin();
        self.edcp = iexp(self.chirality * x);
        self.emdcp = iexp(-self.chirality * x);
        self.u2[(0, 2)] = sin13 * self.emdcp;
        self.u2[(2, 0)] = -sin13 * self.edcp;
        self.rebuild_u();
    }

    fn update_rho(&mut self, x: f64) {
        let ne = x / NUCLEON_MASS / 2.0;
        self.v[(0, 0)] = Complex64::new(self.chirality * SQRT2 * gf() * ne * 1e3, 0.0);
    }

    fn transvac(&self, nu: usize) -> [f64; 3] {
        let mut nu_vec = Vector3::zeros();
        nu_vec[nu] = Complex64::new(1.0, 0.0);
        let uhudnu = self.u * self.hexp * self.ud * nu_vec;
        [uhudnu[0].norm_sqr(), uhudnu[1].norm_sqr(), uhudnu[2].norm_sqr()]
    }

    fn transmat(&self, nu: usize) -> [f64; 3] {
        const N: u32 = 128;
        let l = self.current["L"];
        let e = self.current["E"];

        let mut hexp = Matrix3::identity();
        for j in 1..3 {
            hexp[(j, j)] = iexp(-self.h[(j, j)].re * conv() * l / e / f64::from(N));
        }
        let mut vexp = Matrix3::identity();
        vexp[(0, 0)] = iexp(-self.v[(0, 0)].re * l / f64::from(N));

        let hudvupow = mat_pow(hexp * self.ud * vexp * self.u, N);

        let mut nu_vec = Vector3::zeros();
        nu_vec[nu] = Complex64::new(1.0, 0.0);
        let uhudnu = self.u * hudvupow * self.ud * nu_vec;
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
    let mut current: HashMap<String, f64> = HashMap::new();
    for (k, p) in &params.map {
        current.insert(k.clone(), p.values[0]);
    }

    let nsteps = current["nsteps"] as usize;
    let nu = current["nu"] as usize;
    let rho = current["rho"];

    let range_key = params
        .map
        .iter()
        .find(|(_, p)| p.values.len() > 1)
        .map(|(k, _)| k.as_str())
        .expect("no range parameter defined");
    let range_values = &params.map[range_key].values;
    let start = range_values[0];
    let stop = range_values[1];

    let use_matter = params
        .map
        .get("rho")
        .is_some_and(|p| p.values.len() > 1)
        || rho != 0.0;

    let mut osc = Oscillator::build(current);

    let mut x = Vec::with_capacity(nsteps + 1);
    let mut pe = Vec::with_capacity(nsteps + 1);
    let mut pmu = Vec::with_capacity(nsteps + 1);
    let mut ptau = Vec::with_capacity(nsteps + 1);

    for i in 0..=nsteps {
        let val = start + (i as f64) * (stop - start) / nsteps as f64;
        osc.apply(range_key, val);
        let res = if use_matter {
            osc.transmat(nu)
        } else {
            osc.transvac(nu)
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
