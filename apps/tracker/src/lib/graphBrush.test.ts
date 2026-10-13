import { describe, expect, test } from 'bun:test';
import {
    BRUSH_MIN_AXIS_PX,
    brushChipText,
    brushFromCanvasRect,
    brushIsActiveForAxes,
    brushToScreenRect,
    computeBrushMask,
    canvasXToData,
    canvasYToData,
    dragPassedThreshold,
    invalidateBrushOnAxisChange,
    normalizedRect,
    pointInBrush,
    type GraphBrush
} from './graphBrush';

describe('dragPassedThreshold', () => {
    test('a press without meaningful movement stays a click', () => {
        expect(dragPassedThreshold(10, 10, 10, 10)).toBe(false);
        expect(dragPassedThreshold(10, 10, 13, 13)).toBe(false);
        expect(dragPassedThreshold(10, 10, 10, 13)).toBe(false);
    });

    test('a band drag in a single axis still starts a brush', () => {
        expect(dragPassedThreshold(10, 10, 10, 20)).toBe(true); // vertical band
        expect(dragPassedThreshold(10, 10, 16, 10)).toBe(true); // horizontal band
        expect(dragPassedThreshold(10, 10, 4, 10)).toBe(true); // leftwards
        expect(dragPassedThreshold(10, 10, 10, 13)).toBe(false); // too short
    });
});

describe('normalizedRect', () => {
    test('sorts corners regardless of drag direction', () => {
        expect(normalizedRect(9, 9, 20, 30)).toEqual({ x0: 9, x1: 20, y0: 9, y1: 30 });
        expect(normalizedRect(20, 30, 9, 9)).toEqual({ x0: 9, x1: 20, y0: 9, y1: 30 });
    });
});

describe('brushFromCanvasRect', () => {
    // Plot: 200×100 at offset (40, 18); x maps linearly 0..1000, y 0..180 (i).
    const plot = { l: 40, t: 18, w: 200, h: 100 };
    const axes = {
        xKey: 'perigee',
        yKey: 'i',
        plot,
        xRange: [0, 1000] as [number, number],
        yRange: [0, 180] as [number, number],
        xLog: false,
        yLog: false
    };

    test('converts a linear rect to data bounds', () => {
        const brush = brushFromCanvasRect(normalizedRect(60, 38, 160, 118), axes);
        expect(brush).toEqual({
            xKey: 'perigee',
            xMin: 100,
            xMax: 600,
            yKey: 'i',
            yMin: 0 + (1 - (118 - 18) / 100) * 180,
            yMax: 0 + (1 - (38 - 18) / 100) * 180
        });
    });

    test('clamps the rect to the plot bounds', () => {
        const brush = brushFromCanvasRect(normalizedRect(0, 0, 9999, 9999), axes);
        expect(brush?.xMin).toBe(0);
        expect(brush?.xMax).toBe(1000);
        expect(brush?.yMin).toBe(0);
        expect(brush?.yMax).toBe(180);
    });

    test('band brushes commit with only a hairline on the secondary axis', () => {
        // 5×40 vertical band (5 px wide, 40 px tall): the dominant y axis
        // carries it past the floor; the 5 px x extent only needs a hairline.
        const band = brushFromCanvasRect(normalizedRect(60, 38, 65, 78), axes);
        expect(band).not.toBeNull();
        expect(band?.yMax).toBe(144); // canvas y 38 (top) → 80% up the 0..180 range
        expect(band?.yMin).toBe(72); // canvas y 78 (bottom)
        expect(band?.xMin).toBe(100); // canvas x 60 → 10% of the 0..1000 x range
        expect(band?.xMax).toBe(125); // canvas x 65
    });

    test('a 1px hairline drag still clears', () => {
        expect(brushFromCanvasRect(normalizedRect(60, 38, 100, 39), axes)).toBeNull();
    });

    test('below-threshold blobs clear', () => {
        expect(brushFromCanvasRect(normalizedRect(60, 38, 64, 42), axes)).toBeNull(); // 4×4
    });

    test('rects at the minimum size commit', () => {
        const brush = brushFromCanvasRect(
            normalizedRect(60, 38, 60 + BRUSH_MIN_AXIS_PX, 38 + BRUSH_MIN_AXIS_PX),
            axes
        );
        expect(brush).not.toBeNull();
    });

    test('log-axis conversion is exponential (round trips canvasXToData)', () => {
        const logAxes = { ...axes, xKey: 'a', xLog: true, xRange: [10, 10000] as [number, number] };
        const brush = brushFromCanvasRect(
            // Full-height left half so the y extent stays above the tiny-rect floor.
            normalizedRect(plot.l, plot.t, plot.l + plot.w / 2, plot.t + plot.h),
            logAxes
        );
        // Left half of a log axis → log10 mid-range: 10^(1 + (4−1)/2).
        const mid = 10 ** (1 + (4 - 1) / 2);
        expect(brush?.xMin).toBe(10);
        expect(brush?.xMax).toBeCloseTo(mid, 6);
        expect(brush?.yMin).toBe(0);
        expect(brush?.yMax).toBe(180);
    });

    test('canvasXToData/canvasYToData clamp outside the plot', () => {
        expect(canvasXToData(-50, plot, axes.xRange, false)).toBe(0);
        expect(canvasXToData(99999, plot, axes.xRange, false)).toBe(1000);
        expect(canvasYToData(-50, plot, axes.yRange, false)).toBe(180);
        expect(canvasYToData(99999, plot, axes.yRange, false)).toBe(0);
    });

    test('rejects non-finite data bounds (degenerate axis ranges)', () => {
        const degenerate = { ...axes, xRange: [NaN, NaN] as [number, number] };
        expect(brushFromCanvasRect(normalizedRect(60, 38, 160, 118), degenerate)).toBeNull();
    });
});

describe('pointInBrush', () => {
    const brush: GraphBrush = {
        xKey: 'i',
        xMin: 50,
        xMax: 60,
        yKey: 'perigee',
        yMin: 500,
        yMax: 600
    };

    test('inclusive bounds', () => {
        expect(pointInBrush(brush, 'i', 'perigee', 50, 500)).toBe(true);
        expect(pointInBrush(brush, 'i', 'perigee', 60, 600)).toBe(true);
        expect(pointInBrush(brush, 'i', 'perigee', 55, 550)).toBe(true);
        expect(pointInBrush(brush, 'i', 'perigee', 49.999, 550)).toBe(false);
        expect(pointInBrush(brush, 'i', 'perigee', 55, 600.001)).toBe(false);
    });

    test('non-finite values are never inside', () => {
        expect(pointInBrush(brush, 'i', 'perigee', NaN, 550)).toBe(false);
        expect(pointInBrush(brush, 'i', 'perigee', 55, Infinity)).toBe(false);
    });

    test('a brush for other axes must not filter the current view', () => {
        expect(pointInBrush(brush, 'e', 'apogee', 55, 550)).toBe(false);
        expect(brushIsActiveForAxes(brush, 'e', 'apogee')).toBe(false);
        expect(brushIsActiveForAxes(brush, 'i', 'perigee')).toBe(true);
        expect(brushIsActiveForAxes(null, 'i', 'perigee')).toBe(false);
    });
});

describe('computeBrushMask', () => {
    const brush: GraphBrush = {
        xKey: 'i',
        xMin: 50,
        xMax: 60,
        yKey: 'perigee',
        yMin: 500,
        yMax: 600
    };
    // Tree-filtered samples; `uIndex` is the worker-array slot each sample owns.
    const samples = [
        { uIndex: 0, x: 55, y: 550 },
        { uIndex: 1, x: 70, y: 550 }, // outside on x
        { uIndex: 2, x: 55, y: 900 }, // outside on y
        { uIndex: 3, x: 55, y: 550 },
        { uIndex: 4, x: NaN, y: 550 } // failed propagation row
    ];

    test('flags in slot order and keeps uIndex mapping untouched', () => {
        const mask = computeBrushMask(brush, 'i', 'perigee', samples, (s) => ({ x: s.x, y: s.y }));
        expect(mask).not.toBeNull();
        assert(mask);
        expect(mask.length).toBe(samples.length);
        expect(Array.from(mask)).toEqual([1, 0, 0, 1, 0]);
    });

    test('no brush or brush for other axes → null (no culling overhead)', () => {
        expect(
            computeBrushMask(null, 'i', 'perigee', samples, (s) => ({ x: s.x, y: s.y }))
        ).toBeNull();
        expect(
            computeBrushMask(brush, 'e', 'apogee', samples, (s) => ({ x: s.x, y: s.y }))
        ).toBeNull();
    });

    test('non-dense uIndex slots: one flag per array position, not per uIndex', () => {
        // The flags map by ARRAY POSITION (the slot order shared with the
        // globe), never by uIndex value. This case is defensive: it pins the
        // position-based contract regardless of uIndex density — the worker
        // does not compact rows on skips, but nothing in the contract should
        // ever depend on it.
        const sparse = [
            { uIndex: 5, x: 55, y: 550 },
            { uIndex: 9, x: 70, y: 550 },
            { uIndex: 12, x: 55, y: 550 }
        ];
        const mask = computeBrushMask(brush, 'i', 'perigee', sparse, (s) => ({ x: s.x, y: s.y }));
        expect(mask).not.toBeNull();
        assert(mask);
        expect(mask).toHaveLength(3); // not max(uIndex)+1
        expect(Array.from(mask)).toEqual([1, 0, 1]);
    });

    test('all samples inside → null', () => {
        const inside = [{ uIndex: 5, x: 55, y: 550 }];
        expect(
            computeBrushMask(brush, 'i', 'perigee', inside, (s) => ({ x: s.x, y: s.y }))
        ).toBeNull();
    });

    function assert(value: Uint8Array | null): asserts value is Uint8Array {
        if (!value) throw new Error('expected mask');
    }
});

describe('invalidateBrushOnAxisChange', () => {
    const brush: GraphBrush = {
        xKey: 'i',
        xMin: 50,
        xMax: 60,
        yKey: 'perigee',
        yMin: 500,
        yMax: 600
    };

    test('same axes keep the brush (same reference, no state churn)', () => {
        expect(invalidateBrushOnAxisChange(brush, 'i', 'perigee')).toBe(brush);
    });

    test('either axis changed clears the brush', () => {
        expect(invalidateBrushOnAxisChange(brush, 'e', 'perigee')).toBeNull();
        expect(invalidateBrushOnAxisChange(brush, 'i', 'apogee')).toBeNull();
    });

    test('no brush stays null', () => {
        expect(invalidateBrushOnAxisChange(null, 'i', 'perigee')).toBeNull();
    });
});

describe('brushChipText', () => {
    const brush: GraphBrush = {
        xKey: 'i',
        xMin: 51,
        xMax: 60,
        yKey: 'perigee',
        yMin: 500,
        yMax: 600
    };

    test('formats both axes with the shared parameter formatting', () => {
        const text = brushChipText(
            brush,
            (k) => (k === 'i' ? 'i' : 'peri'),
            (k, v) => (k === 'i' ? v.toFixed(1) : Math.round(v).toString())
        );
        expect(text).toBe('i 51.0–60.0 × peri 500–600');
    });

    test('clearing the brush removes the chip', () => {
        expect(
            brushChipText(
                null,
                () => '',
                () => ''
            )
        ).toBeNull();
    });

    test('a new lasso replaces the previous chip text', () => {
        const first = brushChipText(
            brush,
            () => 'i',
            (_k, v) => `${v}`
        );
        const second = brushChipText(
            { ...brush, xMax: 60.5 },
            () => 'i',
            (_k, v) => `${v}`
        );
        expect(first).not.toBe(second);
        expect(second).toBe('i 51–60.5 × i 500–600');
    });
});

describe('brushToScreenRect', () => {
    const axes = {
        xKey: 'perigee',
        yKey: 'i',
        plot: { l: 40, t: 18, w: 200, h: 100 },
        xRange: [0, 1000] as [number, number],
        yRange: [0, 180] as [number, number],
        xLog: false,
        yLog: false
    };
    const brush: GraphBrush = {
        xKey: 'perigee',
        xMin: 500,
        xMax: 600,
        yKey: 'i',
        yMin: 51,
        yMax: 60
    };

    test('maps data bounds to canvas px (y flipped)', () => {
        expect(brushToScreenRect(brush, axes)).toEqual({
            x0: 140,
            x1: 160,
            y0: 18 + (1 - 60 / 180) * 100,
            y1: 18 + (1 - 51 / 180) * 100
        });
    });

    test('returns null for a stale-axes brush or an empty plot', () => {
        expect(brushToScreenRect({ ...brush, xKey: 'e' }, axes)).toBeNull();
        expect(brushToScreenRect(null, axes)).toBeNull();
        expect(brushToScreenRect(brush, { ...axes, plot: { l: 0, t: 0, w: 0, h: 0 } })).toBeNull();
    });

    test('round-trips through brushFromCanvasRect', () => {
        const rect = brushToScreenRect(brush, axes);
        expect(rect).not.toBeNull();
        const back = brushFromCanvasRect(rect!, axes);
        expect(back?.xMin).toBeCloseTo(500, 6);
        expect(back?.xMax).toBeCloseTo(600, 6);
        expect(back?.yMin).toBeCloseTo(51, 6);
        expect(back?.yMax).toBeCloseTo(60, 6);
    });

    test('maps log axes through the log norm', () => {
        const logAxes = { ...axes, xRange: [100, 10000] as [number, number], xLog: true };
        const logBrush: GraphBrush = { ...brush, xMin: 1000, xMax: 10000 };
        // log10: 100→2, 1000→3, 10000→4 → fractions 0.5 and 1.
        expect(brushToScreenRect(logBrush, logAxes)).toEqual({
            x0: 140,
            x1: 240,
            y0: 18 + (1 - 60 / 180) * 100,
            y1: 18 + (1 - 51 / 180) * 100
        });
    });
});
