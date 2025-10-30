import { translations } from './i18n.js';

const t = (key, params = {}) => {
	let str = translations[AppState.currentLanguage]?.[key] || key;
	for (const p in params) {
		str = str.replace(`{{${p}}}`, params[p]);
	}
	return str;
};

const STORAGE_KEY = 'origamiAppState';

// SECTION: DATA CLASSES
let uniqueIdCounter = 0;
const generateUniqueId = () => `id_${uniqueIdCounter++}`;
const EPSILON = 1e-9;

class Vertex {
	constructor(x, y, isManual = false) {
		this.x = x;
		this.y = y;
		this.id = generateUniqueId();
		this.isManual = isManual;
	}
}

class Face {
	constructor(vertices = [], layer = 0, isRecto = true) {
		this.vertices = vertices;
		this.id = generateUniqueId();
		this.layer = layer;
		this.isRecto = isRecto;
	}
}

class Mesh {
	constructor() {
		this.vertices = [];
		this.faces = [];
		this.creases = [];
	}
}

function cloneMesh(oldMesh) {
	const newMesh = new Mesh();
	const vertexMap = new Map();

	oldMesh.vertices.forEach(v => {
		const newV = new Vertex(v.x, v.y, v.isManual);
		newV.id = v.id;
		newMesh.vertices.push(newV);
		vertexMap.set(v.id, newV);
	});

	oldMesh.faces.forEach(f => {
		const newFaceVertices = f.vertices.map(v => vertexMap.get(v.id));
		const newF = new Face(newFaceVertices, f.layer, f.isRecto);
		newF.id = f.id;
		newMesh.faces.push(newF);
	});

	newMesh.creases = oldMesh.creases.map(c => ({
		p1: { x: c.p1.x, y: c.p1.y },
		p2: { x: c.p2.x, y: c.p2.y }
	}));

	return newMesh;
}

function rehydrateMesh(plainMesh) {
	const newMesh = new Mesh();
	const vertexMap = new Map();

	plainMesh.vertices.forEach(v => {
		const newV = new Vertex(v.x, v.y, v.isManual);
		newV.id = v.id;
		newMesh.vertices.push(newV);
		vertexMap.set(v.id, newV);
	});

	plainMesh.faces.forEach(f => {
		const newFaceVertices = f.vertices.map(v => vertexMap.get(v.id));
		const newF = new Face(newFaceVertices, f.layer, f.isRecto);
		newF.id = f.id;
		newMesh.faces.push(newF);
	});

	newMesh.creases = plainMesh.creases.map(c => ({
		p1: { x: c.p1.x, y: c.p1.y },
		p2: { x: c.p2.x, y: c.p2.y }
	}));

	return newMesh;
}

// SECTION: GEOMETRY UTILS
const GEOMETRY = {
	getLineSide(p, lineP1, lineP2) {
		return (lineP2.x - lineP1.x) * (p.y - lineP1.y) - (lineP2.y - lineP1.y) * (p.x - lineP1.x);
	},

	getLineIntersection(p1, p2, p3, p4) {
		const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
		if (Math.abs(den) < EPSILON) return null;
		const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
		const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
		
		if (t >= -EPSILON && t <= 1 + EPSILON && isFinite(u)) {
			return new Vertex(p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
		}
		return null;
	},
	
	reflectPoint(point, lineP1, lineP2) {
		const A = lineP2.y - lineP1.y;
		const B = lineP1.x - lineP2.x;
		const C = -A * lineP1.x - B * lineP1.y;
		const den = A * A + B * B;
		if (den < EPSILON) return new Vertex(point.x, point.y);

		const d = 2 * (A * point.x + B * point.y + C) / den;
		return new Vertex(point.x - d * A, point.y - d * B);
	},

	getLineFromPoints(p1, p2) {
		const A = p2.y - p1.y;
		const B = p1.x - p2.x;
		const C = -A * p1.x - B * p1.y;
		return { A, B, C };
	},

	getAngleBisector(l1_p1, l1_p2, l2_p1, l2_p2) {
		const l1 = this.getLineFromPoints(l1_p1, l1_p2);
		const l2 = this.getLineFromPoints(l2_p1, l2_p2);

		const d1 = Math.sqrt(l1.A * l1.A + l1.B * l1.B);
		const d2 = Math.sqrt(l2.A * l2.A + l2.B * l2.B);
		if (d1 < EPSILON || d2 < EPSILON) return [];

		const l1n = { A: l1.A / d1, B: l1.B / d1, C: l1.C / d1 };
		const l2n = { A: l2.A / d2, B: l2.B / d2, C: l2.C / d2 };

		const createLine = (A, B, C) => {
			if (Math.abs(A) < EPSILON && Math.abs(B) < EPSILON) return null;
			const dir = { x: -B, y: A };
			const p0 = Math.abs(B) > EPSILON ? new Vertex(0, -C / B) : new Vertex(-C / A, 0);
			const p1 = new Vertex(p0.x - dir.x * 1000, p0.y - dir.y * 1000);
			const p2 = new Vertex(p0.x + dir.x * 1000, p0.y + dir.y * 1000);
			return { p1, p2 };
		};
		
		if (Math.abs(l1n.A * l2n.B - l1n.B * l2n.A) < EPSILON) {
			const dist = Math.abs(l2n.A * l1_p1.x + l2n.B * l1_p1.y + l2n.C);
			if (dist < EPSILON) {
				return []; 
			}
			if (l1n.A * l2n.A < 0 || l1n.B * l2n.B < 0) {
				l2n.A = -l2n.A; l2n.B = -l2n.B; l2n.C = -l2n.C;
			}
			const line = createLine(l1n.A, l1n.B, (l1n.C + l2n.C) / 2);
			return line ? [line] : [];
		}

		const bisectors = [];
		bisectors.push(createLine(l1n.A - l2n.A, l1n.B - l2n.B, l1n.C - l2n.C));
		bisectors.push(createLine(l1n.A + l2n.A, l1n.B + l2n.B, l1n.C + l2n.C));
		
		return bisectors.filter(b => b !== null);
	},
	
	distSq(p1, p2) {
		return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
	},

	getClosestPointOnLineSegment(p, a, b) {
		const l2 = this.distSq(a, b);
		if (l2 < EPSILON) return a;
		let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
		t = Math.max(0, Math.min(1, t));
		return new Vertex(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
	},

	getInfiniteLineIntersection(p1, p2, p3, p4) {
		const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
		if (Math.abs(den) < EPSILON) return null;
		const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
		return new Vertex(p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
	},
	
	isPointInPolygon(point, polygon) {
		let isInside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const xi = polygon[i].x, yi = polygon[i].y;
			const xj = polygon[j].x, yj = polygon[j].y;
			const intersect = ((yi > point.y) !== (yj > point.y))
				&& (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
			if (intersect) isInside = !isInside;
		}
		return isInside;
	},
	
	polygonsIntersect(poly1, poly2) {
		for (let i = 0; i < poly1.length; i++) {
			if (this.isPointInPolygon(poly1[i], poly2)) return true;
		}
		for (let i = 0; i < poly2.length; i++) {
			if (this.isPointInPolygon(poly2[i], poly1)) return true;
		}
		for (let i = 0; i < poly1.length; i++) {
			const p1 = poly1[i];
			const p2 = poly1[(i + 1) % poly1.length];
			for (let j = 0; j < poly2.length; j++) {
				const p3 = poly2[j];
				const p4 = poly2[(j + 1) % poly2.length];
				if (this.getLineIntersection(p1, p2, p3, p4)) return true;
			}
		}
		return false;
	},
	
	getLineCircleIntersection(lineP1, lineP2, circleCenter, radius) {
		const d = { x: lineP2.x - lineP1.x, y: lineP2.y - lineP1.y };
		const f = { x: lineP1.x - circleCenter.x, y: lineP1.y - circleCenter.y };

		const a = d.x * d.x + d.y * d.y;
		const b = 2 * (f.x * d.x + f.y * d.y);
		const c = f.x * f.x + f.y * f.y - radius * radius;

		let discriminant = b * b - 4 * a * c;
		if (discriminant < 0) {
			return [];
		}
		
		if (discriminant < EPSILON) discriminant = 0;

		discriminant = Math.sqrt(discriminant);
		const t1 = (-b - discriminant) / (2 * a);
		const t2 = (-b + discriminant) / (2 * a);

		const solutions = [];
		if (isFinite(t1)) solutions.push(new Vertex(lineP1.x + t1 * d.x, lineP1.y + t1 * d.y));
		if (isFinite(t2) && Math.abs(discriminant) > EPSILON) solutions.push(new Vertex(lineP1.x + t2 * d.x, lineP1.y + t2 * d.y));

		return solutions;
	},

	getLineCircleIntersection(lineP1, lineP2, circleCenter, radius) {
		const d = { x: lineP2.x - lineP1.x, y: lineP2.y - lineP1.y };
		const f = { x: lineP1.x - circleCenter.x, y: lineP1.y - circleCenter.y };

		const a = d.x * d.x + d.y * d.y;
		const b = 2 * (f.x * d.x + f.y * d.y);
		const c = f.x * f.x + f.y * f.y - radius * radius;

		let discriminant = b * b - 4 * a * c;
		if (discriminant < 0) {
			return [];
		}
		
		if (discriminant < EPSILON) discriminant = 0;

		discriminant = Math.sqrt(discriminant);
		const t1 = (-b - discriminant) / (2 * a);
		const t2 = (-b + discriminant) / (2 * a);

		const solutions = [];
		if (isFinite(t1)) solutions.push(new Vertex(lineP1.x + t1 * d.x, lineP1.y + t1 * d.y));
		if (isFinite(t2) && Math.abs(discriminant) > EPSILON) solutions.push(new Vertex(lineP1.x + t2 * d.x, lineP1.y + t2 * d.y));

		return solutions;
	},

	solveCubic(a, b, c, d) {
		if (Math.abs(a) < EPSILON) {
			if (Math.abs(b) < EPSILON) return Math.abs(c) < EPSILON ? [] : [-d / c];
			const D = c * c - 4 * b * d;
			if (D < 0) return [];
			return [(-c + Math.sqrt(D)) / (2*b), (-c - Math.sqrt(D)) / (2*b)];
		}
		b /= a; c /= a; d /= a;
		const p = (3*c - b*b)/3;
		const q = (2*b*b*b - 9*b*c + 27*d)/27;
		if (Math.abs(p) < EPSILON) return [Math.cbrt(-q)-b/3];
		const D = q*q/4 + p*p*p/27;
		if (Math.abs(D) < EPSILON) return [3*q/p-b/3, -3*q/(2*p)-b/3];
		if (D > 0) return [Math.cbrt(-q/2 + Math.sqrt(D)) + Math.cbrt(-q/2 - Math.sqrt(D)) - b/3];
		const u = 2 * Math.sqrt(-p/3);
		const t = Math.acos(-3*q / (p*u)) / 3;
		const k = 2 * Math.PI / 3;
		return [u * Math.cos(t) - b/3, u * Math.cos(t-k) - b/3, u * Math.cos(t-2*k) - b/3];
	},
	
	getCommonTangentsToParabolas(f1, d1_p1, d1_p2, f2, d2_p1, d2_p2) {
		const transform = (p, angle, translate) => ({
			x: (p.x - translate.x) * Math.cos(angle) - (p.y - translate.y) * Math.sin(angle),
			y: (p.x - translate.x) * Math.sin(angle) + (p.y - translate.y) * Math.cos(angle)
		});
		
		const inverseTransform = (p, angle, translate) => ({
			x: p.x * Math.cos(angle) + p.y * Math.sin(angle) + translate.x,
			y: -p.x * Math.sin(angle) + p.y * Math.cos(angle) + translate.y
		});

		const l1_vec_x = d1_p2.x - d1_p1.x;
		const l1_vec_y = d1_p2.y - d1_p1.y;
		const rotationAngle = -Math.atan2(l1_vec_y, l1_vec_x);
		const translation = { x: d1_p1.x, y: d1_p1.y };

		const f1_t = transform(f1, rotationAngle, translation);
		const f2_t = transform(f2, rotationAngle, translation);
		const d2_p1_t = transform(d2_p1, rotationAngle, translation);
		const d2_p2_t = transform(d2_p2, rotationAngle, translation);

		const line2_t = this.getLineFromPoints(d2_p1_t, d2_p2_t);
		let { A, B, C } = line2_t;
		const norm = Math.sqrt(A*A + B*B);
		A /= norm; B /= norm; C /= norm;
		
		const [u, v] = [f1_t.x, f1_t.y];
		const [p, q] = [f2_t.x, f2_t.y];

		const A_ = 2 * v * (B*p - A*q + C);
		const B_ = 2*v*(B*u - A*v) - (u-p)*(u-p) + (v-q)*(v-q) - 2*A*v*(u-p) - 2*B*v*(v-q);
		const C_ = 2*(u-p)*(v - B*v) - 2*(v-q)*(u - A*v);
		const D_ = (u-p)*(u-p) + (v+q)*(v+q) - (2*v*(A*(u-p) + B*(v-q) + A*p + B*q + C));

		const coeffs = [A_, B_, C_, D_];
		const slopes = this.solveCubic(...coeffs).filter(s => isFinite(s));
		const tangents = [];

		for (const m of slopes) {
			const k = (m*u - v + m*m*u + v*m*m) / (2*m);
			
			const p1 = inverseTransform({ x: -1000, y: m * -1000 + k }, rotationAngle, translation);
			const p2 = inverseTransform({ x: 1000, y: m * 1000 + k }, rotationAngle, translation);
			
			tangents.push({ p1, p2 });
		}
		
		if (Math.abs(B) < EPSILON) {
			const y0 = -C/A;
			const m_inf_num = (p-u)*(p-u) - (q-v)*(q-v) + 2*v*q - 2*v*v;
			const m_inf_den = 2*(p-y0)*v;
			if (Math.abs(m_inf_den) > EPSILON) {
				const x0 = m_inf_num / m_inf_den;
				const p1 = inverseTransform({x: x0, y: -1000}, rotationAngle, translation);
				const p2 = inverseTransform({x: x0, y: 1000}, rotationAngle, translation);
				tangents.push({p1, p2});
			}
		}

		return tangents;
	},
};

// SECTION: AXIOMS CONFIGURATION
const AXIOMS = {
	'TOOL_ADD_POINT': {
		nameKey: 'addPointToolName',
		descKey: 'addPointToolDesc',
		requiredPoints: 0,
		prompts: () => 'addPointToolPrompt1',
	},
	'AXIOM_1': {
		nameKey: 'axiom1Name',
		descKey: 'axiom1Desc',
		requiredPoints: 2,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom1Prompt1';
				case 1: return 'axiom1Prompt2';
				default: return 'axiom1PromptReady';
			}
		},
		getFoldLine: (points) => {
			const [p1, p2] = points;
			if (GEOMETRY.distSq(p1, p2) < 1e-9) return { error: 'errorIdenticalPoints' };
			const vec = new Vertex(p2.x - p1.x, p2.y - p1.y);
			const pA = new Vertex(p1.x - vec.x * 1000, p1.y - vec.y * 1000);
			const pB = new Vertex(p1.x + vec.x * 1000, p1.y + vec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_2': {
		nameKey: 'axiom2Name',
		descKey: 'axiom2Desc',
		requiredPoints: 2,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom2Prompt1';
				case 1: return 'axiom2Prompt2';
				default: return 'axiom2PromptReady';
			}
		},
		getFoldLine: (points) => {
			const [p1, p2] = points;
			if (GEOMETRY.distSq(p1, p2) < EPSILON) return { error: 'errorIdenticalPoints' };
			const midPoint = new Vertex((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
			const vec = new Vertex(p2.x - p1.x, p2.y - p1.y);
			const perpendicularVec = new Vertex(-vec.y, vec.x);
			
			const pA = new Vertex(midPoint.x - perpendicularVec.x * 1000, midPoint.y - perpendicularVec.y * 1000);
			const pB = new Vertex(midPoint.x + perpendicularVec.x * 1000, midPoint.y + perpendicularVec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_3': {
		nameKey: 'axiom3Name',
		descKey: 'axiom3Desc',
		requiredPoints: 4,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom3Prompt1';
				case 1: return 'axiom3Prompt2';
				case 2: return 'axiom3Prompt3';
				case 3: return 'axiom3Prompt4';
				default: return 'axiom3PromptReady';
			}
		},
		getFoldLine: (points) => {
			const [l1p1, l1p2, l2p1, l2p2] = points;
			if (GEOMETRY.distSq(l1p1, l1p2) < EPSILON || GEOMETRY.distSq(l2p1, l2p2) < EPSILON) return { error: 'errorLineDefinition' };

			const bisectors = GEOMETRY.getAngleBisector(l1p1, l1p2, l2p1, l2p2);
			if (bisectors.length === 0) return { error: 'errorIdenticalLines' };

			const bisector = bisectors[0];
			const side1 = GEOMETRY.getLineSide(l1p1, bisector.p1, bisector.p2);
			const side2 = GEOMETRY.getLineSide(l2p1, bisector.p1, bisector.p2);
			
			if (side1 * side2 > EPSILON && bisectors.length > 1) {
				return bisectors[1];
			}
			return bisector;
		}
	},
	'AXIOM_4': {
		nameKey: 'axiom4Name',
		descKey: 'axiom4Desc',
		requiredPoints: 3,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom4Prompt1';
				case 1: return 'axiom4Prompt2';
				case 2: return 'axiom4Prompt3';
				default: return 'axiom4PromptReady';
			}
		},
		getFoldLine: (points) => {
			const [l1p1, l1p2, p3] = points;
			if (GEOMETRY.distSq(l1p1, l1p2) < EPSILON) return { error: 'errorLineDefinition' };
			const vec = new Vertex(l1p2.x - l1p1.x, l1p2.y - l1p1.y);
			const pVec = new Vertex(-vec.y, vec.x);
			const pA = new Vertex(p3.x - pVec.x * 1000, p3.y - pVec.y * 1000);
			const pB = new Vertex(p3.x + pVec.x * 1000, p3.y + pVec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_5': {
		nameKey: 'axiom5Name',
		descKey: 'axiom5Desc',
		requiredPoints: 4,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom5Prompt1';
				case 1: return 'axiom5Prompt2';
				case 2: return 'axiom5Prompt3';
				case 3: return 'axiom5Prompt4';
				default: return 'axiom5PromptReady';
			}
		},
		getFoldLine: (points) => {
			const [p1, p2, l1p1, l1p2] = points;
			if (GEOMETRY.distSq(l1p1, l1p2) < EPSILON) return { error: 'errorLineDefinition' };

			const radius = Math.sqrt(GEOMETRY.distSq(p1, p2));
			if (radius < EPSILON) return { error: 'errorIdenticalPoints' };

			const intersections = GEOMETRY.getLineCircleIntersection(l1p1, l1p2, p1, radius);
			if (intersections.length === 0) return { error: 'errorAxiom5NoSolution' };
			
			const validIntersections = intersections.filter(p => GEOMETRY.distSq(p, p2) > EPSILON);

			if (validIntersections.length === 0) return { error: 'errorInvalidFold' };
			
			const p2prime = validIntersections[0];

			const midPoint = new Vertex((p2.x + p2prime.x) / 2, (p2.y + p2prime.y) / 2);
			const vec = new Vertex(p2prime.x - p2.x, p2prime.y - p2.y);
			const pVec = new Vertex(-vec.y, vec.x);

			const pA = new Vertex(midPoint.x - pVec.x * 1000, midPoint.y - pVec.y * 1000);
			const pB = new Vertex(midPoint.x + pVec.x * 1000, midPoint.y + pVec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_6': {
		nameKey: 'axiom6Name',
		descKey: 'axiom6Desc',
		requiredPoints: 6,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom6Prompt1';
				case 1: return 'axiom6Prompt2';
				case 2: return 'axiom6Prompt3';
				case 3: return 'axiom6Prompt4';
				case 4: return 'axiom6Prompt5';
				case 5: return 'axiom6Prompt6';
				default: return 'axiom6PromptReady';
			}
		},
		getFoldLines: (points) => {
			const [p1, l1p1, l1p2, p2, l2p1, l2p2] = points;
			if (GEOMETRY.distSq(l1p1, l1p2) < EPSILON || GEOMETRY.distSq(l2p1, l2p2) < EPSILON) return { error: 'errorLineDefinition' };
			
			const solutions = GEOMETRY.getCommonTangentsToParabolas(p1, l1p1, l1p2, p2, l2p1, l2p2);
			
			if (solutions.length === 0) {
				return { error: 'errorAxiom6NoSolution' };
			}
			return solutions;
		}
	},
	'AXIOM_7': {
		nameKey: 'axiom7Name',
		descKey: 'axiom7Desc',
		requiredPoints: 5,
		prompts: (selected) => {
			switch (selected.length) {
				case 0: return 'axiom7Prompt1';
				case 1: return 'axiom7Prompt2';
				case 2: return 'axiom7Prompt3';
				case 3: return 'axiom7Prompt4';
				case 4: return 'axiom7Prompt5';
				default: return 'axiom7PromptReady';
			}
		},
		getFoldLine: (points) => {
			const [p1, l1p1, l1p2, l2p1, l2p2] = points;
			if (GEOMETRY.distSq(l1p1, l1p2) < EPSILON || GEOMETRY.distSq(l2p1, l2p2) < EPSILON) return { error: 'errorLineDefinition' };

			const l1 = GEOMETRY.getLineFromPoints(l1p1, l1p2);
			const vecL2 = { x: l2p2.x - l2p1.x, y: l2p2.y - l2p1.y };

			const n = { x: vecL2.x, y: vecL2.y };
			const nSq = n.x * n.x + n.y * n.y;
			if (nSq < EPSILON) return { error: 'errorLineDefinition' };
			
			const term1 = l1.A * p1.x + l1.B * p1.y + l1.C;
			const term2 = 2 * (l1.A * n.x + l1.B * n.y);
			
			if (Math.abs(term2) < EPSILON) return { error: 'errorAxiom7NoSolution' };
			
			const d = - (nSq * term1) / term2 - (n.x * p1.x + n.y * p1.y);
			
			const foldNormal = { x: n.x, y: n.y };
			const foldDir = { x: -foldNormal.y, y: foldNormal.x };
			
			let p0;
			if (Math.abs(foldNormal.y) > EPSILON) {
				p0 = new Vertex(0, -d / foldNormal.y);
			} else {
				p0 = new Vertex(-d / foldNormal.x, 0);
			}

			const pA = new Vertex(p0.x - foldDir.x * 1000, p0.y - foldDir.y * 1000);
			const pB = new Vertex(p0.x + foldDir.x * 1000, p0.y + foldDir.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
};

// SECTION: FOLDING LOGIC
const FoldEngine = {
	performFold(mesh, foldLine, foldDirection, mobilePoint = null, topmostFace = null) {
		const { p1: foldLineP1, p2: foldLineP2 } = foldLine;

		const faceIdToFace = new Map(mesh.faces.map(f => [f.id, f]));
		const newMesh = new Mesh();
		const intersectionVertices = new Map();

		const getPolygonArea = (vertices) => {
			let area = 0;
			for (let i = 0; i < vertices.length; i++) {
				const p1 = vertices[i];
				const p2 = vertices[(i + 1) % vertices.length];
				area += p1.x * p2.y - p2.x * p1.y;
			}
			return Math.abs(area) / 2;
		};

		const splitFace = (face) => {
			const poly = face.vertices;
			const polySides = poly.map(p => GEOMETRY.getLineSide(p, foldLineP1, foldLineP2));
			
			const allOnOneSide = polySides.every(s => s >= -EPSILON) || polySides.every(s => s <= EPSILON);

			if (allOnOneSide) {
				const newFace = new Face([...face.vertices], face.layer, face.isRecto);
				newFace.parentId = face.id;
				return [newFace];
			}
			
			const newPoly1 = [], newPoly2 = [];
			
			for (let i = 0; i < poly.length; i++) {
				const currentPoint = poly[i];
				const nextPoint = poly[(i + 1) % poly.length];
				const currentSide = polySides[i];
				const nextSide = polySides[(i + 1) % poly.length];

				if (currentSide >= -EPSILON) newPoly1.push(currentPoint);
				if (currentSide <= EPSILON) newPoly2.push(currentPoint);

				if (currentSide * nextSide < -EPSILON) {
					const intersection = GEOMETRY.getLineIntersection(currentPoint, nextPoint, foldLineP1, foldLineP2);
					if (intersection) {
						const key = `${intersection.x.toFixed(5)},${intersection.y.toFixed(5)}`;
						if (!intersectionVertices.has(key)) {
							intersectionVertices.set(key, intersection);
						}
						const sharedVertex = intersectionVertices.get(key);
						newPoly1.push(sharedVertex);
						newPoly2.push(sharedVertex);
					}
				}
			}

			const fixPolygonOrder = (poly) => {
				if (poly.length < 3) return poly;
				let cx = 0; let cy = 0;
				poly.forEach(p => { cx += p.x; cy += p.y; });
				cx /= poly.length; cy /= poly.length;
				return poly.sort((a,b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
			};
			
			const resultingFaces = [];
			if (newPoly1.length > 2) {
				const f = new Face(fixPolygonOrder(newPoly1), face.layer, face.isRecto);
				f.parentId = face.id;
				resultingFaces.push(f);
			}
			if (newPoly2.length > 2) {
				const f = new Face(fixPolygonOrder(newPoly2), face.layer, face.isRecto);
				f.parentId = face.id;
				resultingFaces.push(f);
			}
			return resultingFaces;
		};

		mesh.faces.forEach(face => {
			const splitResults = splitFace(face);
			newMesh.faces.push(...splitResults);
		});
		
		let mobileFaces, staticFaces, mobileSideSign;

		if (mobilePoint) {
			const sideOfMobilePoint = GEOMETRY.getLineSide(mobilePoint, foldLineP1, foldLineP2);
			if (Math.abs(sideOfMobilePoint) < EPSILON) {
				return { mesh: null, error: 'errorMobilePointOnFoldLine' };
			}
			mobileSideSign = Math.sign(sideOfMobilePoint);
			
			if (topmostFace) {
				const originalTopFace = faceIdToFace.get(topmostFace.id);
				if (originalTopFace) {
					const targetLayer = originalTopFace.layer;

					const mobileSideCandidates = newMesh.faces.filter(face => {
						const centroidX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
						const centroidY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
						const side = GEOMETRY.getLineSide({ x: centroidX, y: centroidY }, foldLineP1, foldLineP2);
						return Math.sign(side) === mobileSideSign;
					});

					const seedFace = mobileSideCandidates.find(f => f.parentId === topmostFace.id);

					if (seedFace) {
						const facesAtTargetLayer = mobileSideCandidates.filter(f => {
							const originalFace = faceIdToFace.get(f.parentId);
							return originalFace && originalFace.layer === targetLayer;
						});

						mobileFaces = [];
						const queue = [seedFace];
						const visited = new Set([seedFace.id]);

						while (queue.length > 0) {
							const currentFace = queue.shift();
							mobileFaces.push(currentFace);
							const currentVertexIds = new Set(currentFace.vertices.map(v => v.id));

							for (const neighbor of facesAtTargetLayer) {
								if (visited.has(neighbor.id)) continue;
								for (const vertex of neighbor.vertices) {
									if (currentVertexIds.has(vertex.id)) {
										visited.add(neighbor.id);
										queue.push(neighbor);
										break;
									}
								}
							}
						}
					}
				}
			}

			if (!mobileFaces) {
				mobileFaces = newMesh.faces.filter(face => {
					const centroidX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
					const centroidY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
					const side = GEOMETRY.getLineSide({x: centroidX, y: centroidY}, foldLineP1, foldLineP2);
					return Math.sign(side) === mobileSideSign;
				});
			}
			staticFaces = newMesh.faces.filter(face => !mobileFaces.includes(face));
		} else {
			const side1Faces = [], side2Faces = [];
			let side1Area = 0, side2Area = 0;
	
			newMesh.faces.forEach(face => {
				const centroidX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
				const centroidY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
				const side = GEOMETRY.getLineSide({x: centroidX, y: centroidY}, foldLineP1, foldLineP2);
				
				if (Math.abs(side) < EPSILON) return;
	
				const area = getPolygonArea(face.vertices);
				if (side > 0) {
					side1Faces.push(face);
					side1Area += area;
				} else {
					side2Faces.push(face);
					side2Area += area;
				}
			});
	
			if (side1Area < EPSILON || side2Area < EPSILON) {
				return { mesh: null, error: 'errorFoldLineMissesPaper' };
			}

			mobileFaces = side1Area < side2Area ? side1Faces : side2Faces;
			staticFaces = side1Area < side2Area ? side2Faces : side1Faces;
			mobileSideSign = side1Area < side2Area ? 1 : -1;
		}

		const reflectedMobileFaces = mobileFaces.map(face => {
			const reflectedVertices = face.vertices.map(v => GEOMETRY.reflectPoint(v, foldLineP1, foldLineP2));
			return new Face(reflectedVertices, face.layer, !face.isRecto);
		});

		const collidingStaticLayers = [];
		for (const reflectedFace of reflectedMobileFaces) {
			for (const staticFace of staticFaces) {
				if (GEOMETRY.polygonsIntersect(reflectedFace.vertices, staticFace.vertices)) {
					collidingStaticLayers.push(faceIdToFace.get(staticFace.parentId)?.layer ?? 0);
				}
			}
		}

		const allLayers = mesh.faces.map(f => f.layer);
		const maxLayerInMesh = allLayers.length > 0 ? Math.max(...allLayers) : -1;
		const minLayerInMesh = allLayers.length > 0 ? Math.min(...allLayers) : 0;
		
		const mobileOriginalLayers = mobileFaces.map(f => faceIdToFace.get(f.parentId)?.layer ?? 0);
		const minOriginalMobileLayer = mobileOriginalLayers.length > 0 ? Math.min(...mobileOriginalLayers) : 0;
		const maxOriginalMobileLayer = mobileOriginalLayers.length > 0 ? Math.max(...mobileOriginalLayers) : 0;

		const reflectedVerticesMap = new Map();

		mobileFaces.forEach(face => {
			const originalFace = faceIdToFace.get(face.parentId);
			if (!originalFace) return;
			
			let relativeLayer, baseLayer;
			if (foldDirection === 'valley') {
				relativeLayer = originalFace.layer - minOriginalMobileLayer;
				baseLayer = collidingStaticLayers.length > 0 ? Math.max(...collidingStaticLayers) + 1 : maxLayerInMesh + 1;
				face.layer = baseLayer + relativeLayer;
			} else { // mountain
				relativeLayer = maxOriginalMobileLayer - originalFace.layer;
				baseLayer = collidingStaticLayers.length > 0 ? Math.min(...collidingStaticLayers) - 1 : minLayerInMesh - 1;
				face.layer = baseLayer - relativeLayer;
			}
			
			face.isRecto = !originalFace.isRecto;

			const newFaceVertices = [];
			face.vertices.forEach(v => {
				const vKey = `${v.x.toFixed(5)},${v.y.toFixed(5)}`;
				if (reflectedVerticesMap.has(vKey)) {
					newFaceVertices.push(reflectedVerticesMap.get(vKey));
				} else {
					const reflected = GEOMETRY.reflectPoint(v, foldLineP1, foldLineP2);
					const newV = new Vertex(reflected.x, reflected.y);
					newV.id = v.id; 
					reflectedVerticesMap.set(vKey, newV);
					newFaceVertices.push(newV);
				}
			});
			face.vertices = newFaceVertices;
		});

		newMesh.faces = [...staticFaces, ...mobileFaces];
		
		const allVerticesMap = new Map();

		newMesh.faces.forEach(f => f.vertices.forEach(v => {
			if (!allVerticesMap.has(v.id)) {
				allVerticesMap.set(v.id, v);
			}
		}));

		mesh.vertices.forEach(originalVertex => {
			if (!allVerticesMap.has(originalVertex.id)) {
				const side = GEOMETRY.getLineSide(originalVertex, foldLineP1, foldLineP2);
				if (side * mobileSideSign > EPSILON) {
					const reflected = GEOMETRY.reflectPoint(originalVertex, foldLineP1, foldLineP2);
					const newV = new Vertex(reflected.x, reflected.y);
					newV.id = originalVertex.id;
					allVerticesMap.set(newV.id, newV);
				} else {
					allVerticesMap.set(originalVertex.id, originalVertex);
				}
			}
		});

		newMesh.vertices = Array.from(allVerticesMap.values());

		newMesh.creases = [...mesh.creases, foldLine];
		return { mesh: newMesh, error: null };
	},
};

// SECTION: APPLICATION STATE MANAGEMENT
const AppState = {
	mesh: null,
	history: [],
	historyIndex: -1,
	selectedVertices: [],
	isProcessing: false,
	currentAxiom: 'AXIom_2',
	isXRayMode: false,
	viewBox: { x: 0, y: 0, width: 0, height: 0 },
	isPanning: false,
	panStartPoint: { x: 0, y: 0 },
	dragOccurred: false,
	currentLanguage: 'en',
	selectionCandidates: [],
	selectionCandidateIndex: 0,
	previewPoint: null,
	cursorPosition: null,
	axiom6Solutions: [],
	selectedAxiom6SolutionIndex: null,
	isToolbarCollapsed: false,
	isInfoPanelCollapsed: false,
	activeResizer: null,

	init() {
		const m = new Mesh();
		const size = 600;
		const container = UI.elements.svg.parentElement;
		const viewWidth = container.clientWidth;
		const viewHeight = container.clientHeight;
		this.viewBox.width = viewWidth;
		this.viewBox.height = viewHeight;
		this.viewBox.x = 0;
		this.viewBox.y = 0;

		const centerX = viewWidth / 2;
		const centerY = viewHeight / 2;

		const v1 = new Vertex(centerX - size / 2, centerY - size / 2);
		const v2 = new Vertex(centerX + size / 2, centerY - size / 2);
		const v3 = new Vertex(centerX + size / 2, centerY + size / 2);
		const v4 = new Vertex(centerX - size / 2, centerY + size / 2);
		m.vertices.push(v1, v2, v3, v4);
		m.faces.push(new Face([v1, v2, v3, v4]));
		
		this.mesh = m;
		this.history = [{ mesh: cloneMesh(m), action: { key: 'historyInit' } }];
		this.historyIndex = 0;
		this.selectedVertices = [];
		this.isProcessing = false;
		this.isXRayMode = false;
		this.isToolbarCollapsed = false;
		this.isInfoPanelCollapsed = false;
	},

	saveState() {
		this.undoStack.push(cloneMesh(this.mesh));
		this.redoStack = [];
	},

	undo() {
		if (this.historyIndex <= 0) return;
		this.historyIndex--;
		this.mesh = cloneMesh(this.history[this.historyIndex].mesh);
	},

	redo() {
		if (this.historyIndex >= this.history.length - 1) return;
		this.historyIndex++;
		this.mesh = cloneMesh(this.history[this.historyIndex].mesh);
	},

	selectVertex(vertex, isEdgeSelection = false, otherVertex = null) {
		const requiredPoints = AXIOMS[this.currentAxiom].requiredPoints;
		const index = this.selectedVertices.findIndex(v => v.id === vertex.id);

		if (index > -1) {
			this.selectedVertices.splice(index, 1);
		} else if (isEdgeSelection) {
			if (this.selectedVertices.length <= requiredPoints - 2) {
				this.selectedVertices.push(vertex, otherVertex);
			}
		} else if (this.selectedVertices.length < requiredPoints) {
			this.selectedVertices.push(vertex);
		}
	},

	clearSelection() {
		this.selectedVertices = [];
		this.axiom6Solutions = [];
		this.selectedAxiom6SolutionIndex = null;
	}
};

// SECTION: UI MANAGEMENT
const UI = {
	elements: {},

	init(controller) {
		this.elements = {
			svg: document.getElementById('origami-svg'),
			foldValleyButton: document.getElementById('fold-valley-button'),
			foldMountainButton: document.getElementById('fold-mountain-button'),
			flipButton: document.getElementById('flip-button'),
			recenterViewButton: document.getElementById('recenter-view-button'),
			undoButton: document.getElementById('undo-button'),
			redoButton: document.getElementById('redo-button'),
			resetButton: document.getElementById('reset-button'),
			xrayButton: document.getElementById('xray-button'),
			axiomButtons: {
				'TOOL_ADD_POINT': document.getElementById('add-point-button'),
				'AXIOM_1': document.getElementById('axiom1-button'),
				'AXIOM_2': document.getElementById('axiom2-button'),
				'AXIOM_3': document.getElementById('axiom3-button'),
				'AXIOM_4': document.getElementById('axiom4-button'),
				'AXIOM_5': document.getElementById('axiom5-button'),
				'AXIOM_6': document.getElementById('axiom6-button'),
				'AXIOM_7': document.getElementById('axiom7-button'),
			},
			selectedPointsCountEl: document.getElementById('selected-points-count'),
			requiredPointsCountEl: document.getElementById('required-points-count'),
			faceCountEl: document.getElementById('face-count'),
			vertexCountEl: document.getElementById('vertex-count'),
			historyListEl: document.getElementById('history-list'),
			currentToolNameEl: document.getElementById('current-tool-name'),
			currentToolDescEl: document.getElementById('current-tool-desc'),
			errorMessageEl: document.getElementById('error-message'),
			selectionProgressBar: document.getElementById('selection-progress-bar'),
			langButtons: document.querySelectorAll('[data-lang]'),
			cursorPositionValueEl: document.getElementById('cursor-position-value'),
			toggleToolbarButton: document.getElementById('toggle-toolbar-left'),
			toggleInfoPanelButton: document.getElementById('toggle-toolbar-right'),
			resizerLeft: document.getElementById('resizer-left'),
			resizerRight: document.getElementById('resizer-right'),
		};
		
		this.elements.svg.addEventListener('click', (e) => controller.handleSVGClick(e));
		this.elements.svg.addEventListener('mousedown', (e) => controller.handlePanStart(e));
		this.elements.svg.addEventListener('mousemove', (e) => controller.handleMouseMove(e));
		this.elements.svg.addEventListener('mouseup', () => controller.handlePanEnd());
		this.elements.svg.addEventListener('mouseleave', () => controller.handleMouseLeave());
		this.elements.svg.addEventListener('wheel', (e) => controller.handleZoom(e));

		this.elements.foldValleyButton.addEventListener('click', () => controller.executeFold('valley'));
		this.elements.foldMountainButton.addEventListener('click', () => controller.executeFold('mountain'));
		this.elements.flipButton.addEventListener('click', () => controller.flipPaper());
		this.elements.recenterViewButton.addEventListener('click', () => controller.recenterView());
		this.elements.undoButton.addEventListener('click', () => controller.undo());
		this.elements.redoButton.addEventListener('click', () => controller.redo());
		this.elements.resetButton.addEventListener('click', () => controller.reset());
		this.elements.xrayButton.addEventListener('click', () => controller.toggleXRay());
		this.elements.historyListEl.addEventListener('click', (e) => controller.handleHistoryClick(e));

		Object.keys(this.elements.axiomButtons).forEach(axiomId => {
			const button = this.elements.axiomButtons[axiomId];
			if (button) {
				button.addEventListener('click', () => controller.changeAxiom(axiomId));
			}
		});

		this.elements.langButtons.forEach(button => {
			button.addEventListener('click', (e) => controller.changeLanguage(e.currentTarget.dataset.lang));
		});

		this.elements.toggleToolbarButton.addEventListener('click', () => controller.toggleToolbar());
		this.elements.toggleInfoPanelButton.addEventListener('click', () => controller.toggleInfoPanel());
		this.elements.resizerLeft.addEventListener('mousedown', (e) => controller.handleResizeStart(e, 'left'));
		this.elements.resizerRight.addEventListener('mousedown', (e) => controller.handleResizeStart(e, 'right'));
	},
	
	render(state) {
		const { mesh, selectedVertices, currentAxiom, history, historyIndex, isProcessing, isXRayMode, viewBox, previewPoint, axiom6Solutions, selectedAxiom6SolutionIndex } = state;

		const scaleFactor = viewBox.width / this.elements.svg.clientWidth;

		this.elements.svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
		this.elements.svg.innerHTML = '';
		this.elements.svg.classList.toggle('xray-mode', isXRayMode);

		const shadowColor = getComputedStyle(document.documentElement).getPropertyValue('--palette-dark-1');
		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		defs.innerHTML = `
			<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
				<polygon points="0 0, 10 3.5, 0 7" fill="${getComputedStyle(document.documentElement).getPropertyValue('--highlight-color')}" />
			</marker>
			<filter id="drop-shadow" x="-50%" y="-50%" width="400%" height="400%">
				<feDropShadow dx="${2 * scaleFactor}" dy="${2 * scaleFactor}" stdDeviation="${2 * scaleFactor}" flood-color="${shadowColor}" flood-opacity="0.5"/>
			</filter>
		`;
		this.elements.svg.appendChild(defs);

		const maxLayer = mesh.faces.reduce((max, f) => Math.max(max, f.layer), 0);
		const facesAndPolygons = mesh.faces.map(face => {
			const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
			const pointsString = face.vertices.map(v => `${v.x},${v.y}`).join(' ');
			polygon.setAttribute('points', pointsString);
			polygon.setAttribute('data-face-id', face.id);
			polygon.classList.add(face.isRecto ? 'recto' : 'verso');
			
			const brightness = 1 - (maxLayer - face.layer) * 0.05;
			polygon.style.filter = `brightness(${brightness})`;
			polygon.style.strokeWidth = `${0.5 * scaleFactor}px`;

			let castsShadow = false;
			for (const otherFace of mesh.faces) {
				if (otherFace.id !== face.id && otherFace.layer < face.layer) {
					if (GEOMETRY.polygonsIntersect(face.vertices, otherFace.vertices)) {
						castsShadow = true;
						break;
					}
				}
			}
			if (castsShadow) {
				polygon.style.filter += ' url(#drop-shadow)';
			}

			return { face, polygon };
		});

		facesAndPolygons.sort((a, b) => a.face.layer - b.face.layer);
		facesAndPolygons.forEach(({ polygon }) => this.elements.svg.appendChild(polygon));

		const uniqueEdges = new Map();
		mesh.faces.forEach(face => {
			for (let i = 0; i < face.vertices.length; i++) {
				const v1 = face.vertices[i];
				const v2 = face.vertices[(i + 1) % face.vertices.length];
				const key = [v1.id, v2.id].sort().join('-');
				if (!uniqueEdges.has(key)) {
					uniqueEdges.set(key, { v1, v2 });
				}
			}
		});

		if (isXRayMode) {
			uniqueEdges.forEach(({ v1, v2 }) => {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', v1.x); line.setAttribute('y1', v1.y);
				line.setAttribute('x2', v2.x); line.setAttribute('y2', v2.y);
				line.classList.add('hidden-edge');
				line.style.strokeWidth = `${0.8 * scaleFactor}px`;
				this.elements.svg.appendChild(line);
			});
		} else {
			mesh.creases.forEach(crease => {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', crease.p1.x); line.setAttribute('y1', crease.p1.y);
				line.setAttribute('x2', crease.p2.x); line.setAttribute('y2', crease.p2.y);
				line.classList.add('crease');
				line.style.strokeWidth = `${1 * scaleFactor}px`;
				this.elements.svg.appendChild(line);
			});
		}

		const drawPreviewLine = (p1, p2, className, isSelected = false) => {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
			line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
			line.classList.add(className);
			let baseWidth = className === 'preview-line' ? 1.5 : 1.5;
			if (isSelected) {
				baseWidth = 3;
				line.style.strokeDasharray = 'none';
			}
			line.style.strokeWidth = `${baseWidth * scaleFactor}px`;
			this.elements.svg.appendChild(line);
		};

		const axiomInfo = AXIOMS[currentAxiom];
		if (selectedVertices.length > 0) {
			if ((currentAxiom === 'AXIOM_3' || currentAxiom === 'AXIOM_4' || currentAxiom === 'AXIOM_5' || currentAxiom === 'AXIOM_6' || currentAxiom === 'AXIOM_7') && selectedVertices.length >= 2) {
				drawPreviewLine(selectedVertices[0], selectedVertices[1], 'construction-line');
				if ((currentAxiom === 'AXIOM_3' || currentAxiom === 'AXIOM_6') && selectedVertices.length >= 4) {
					drawPreviewLine(selectedVertices[2], selectedVertices[3], 'construction-line');
				} else if (currentAxiom === 'AXIOM_5' && selectedVertices.length >= 4) {
					drawPreviewLine(selectedVertices[2], selectedVertices[3], 'construction-line');
				}
				if (currentAxiom === 'AXIOM_6' && selectedVertices.length >= 6) {
					drawPreviewLine(selectedVertices[4], selectedVertices[5], 'construction-line');
				}
				if (currentAxiom === 'AXIOM_7' && selectedVertices.length >= 3) {
					drawPreviewLine(selectedVertices[1], selectedVertices[2], 'construction-line');
					if (selectedVertices.length >= 5) {
						drawPreviewLine(selectedVertices[3], selectedVertices[4], 'construction-line');
					}
				}
			}
		}

		if (axiomInfo.requiredPoints > 0 && selectedVertices.length === axiomInfo.requiredPoints) {
			if (currentAxiom === 'AXIOM_6') {
				axiom6Solutions.forEach((line, index) => {
					drawPreviewLine(line.p1, line.p2, 'preview-line', index === selectedAxiom6SolutionIndex);
				});
			} else {
				const foldLine = axiomInfo.getFoldLine(selectedVertices);
				if (foldLine && !foldLine.error) {
					drawPreviewLine(foldLine.p1, foldLine.p2, 'preview-line');
					
					let mobilePoint;
					const [p1, p2] = selectedVertices;
					switch (currentAxiom) {
						case 'AXIOM_2': mobilePoint = p1; break;
						case 'AXIOM_3': mobilePoint = p1; break;
						case 'AXIOM_4': mobilePoint = selectedVertices[2]; break;
						case 'AXIOM_5': mobilePoint = p2; break;
						case 'AXIOM_7': mobilePoint = p1; break;
						default: mobilePoint = p1; break;
					}

					if (mobilePoint) {
						const mobileSideSign = GEOMETRY.getLineSide(mobilePoint, foldLine.p1, foldLine.p2);
						const reflectedPoint = GEOMETRY.reflectPoint(mobilePoint, foldLine.p1, foldLine.p2);
						if (Math.abs(mobileSideSign) > 1e-9) {
							const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
							const midFold = { x: (mobilePoint.x + reflectedPoint.x) / 2, y: (mobilePoint.y + reflectedPoint.y) / 2 };
							const control = { 
								x: midFold.x - (mobilePoint.y - midFold.y) * 0.5,
								y: midFold.y + (mobilePoint.x - midFold.x) * 0.5
							};
							path.setAttribute('d', `M ${mobilePoint.x} ${mobilePoint.y} Q ${control.x} ${control.y} ${reflectedPoint.x} ${reflectedPoint.y}`);
							path.classList.add('fold-arrow');
							path.style.fill = 'none';
							path.style.strokeWidth = `${2 * scaleFactor}px`;
							this.elements.svg.appendChild(path);
						}
					}
				}
			}
		}

		if (currentAxiom !== 'TOOL_ADD_POINT') {
			uniqueEdges.forEach(({ v1, v2 }) => {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', v1.x); line.setAttribute('y1', v1.y);
				line.setAttribute('x2', v2.x); line.setAttribute('y2', v2.y);
				line.setAttribute('data-v1-id', v1.id);
				line.setAttribute('data-v2-id', v2.id);
				line.classList.add('edge-handle');
				line.style.strokeWidth = `${10 * scaleFactor}px`;
				this.elements.svg.appendChild(line);
			});
		}

		if (previewPoint) {
			if (previewPoint.snapLine) {
				drawPreviewLine(previewPoint.snapLine.p1, previewPoint.snapLine.p2, 'construction-line');
			}
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', previewPoint.x);
			circle.setAttribute('cy', previewPoint.y);
			circle.setAttribute('r', 6 * scaleFactor);
			circle.style.fill = 'var(--highlight-color)';
			circle.style.opacity = '0.7';
			circle.style.pointerEvents = 'none';
			this.elements.svg.appendChild(circle);
		}

		const vertexMaxLayerMap = new Map();
		mesh.faces.forEach(face => {
			face.vertices.forEach(vertex => {
				const currentMax = vertexMaxLayerMap.get(vertex.id) || -Infinity;
				if (face.layer > currentMax) {
					vertexMaxLayerMap.set(vertex.id, face.layer);
				}
			});
		});

		mesh.vertices.forEach(vertex => {
			const maxLayerOfVertex = vertexMaxLayerMap.get(vertex.id);
			let isHidden = false;

			if (!isXRayMode && maxLayerOfVertex !== undefined) {
				for (const face of mesh.faces) {
					if (face.layer > maxLayerOfVertex) {
						if (!face.vertices.some(v => v.id === vertex.id) && GEOMETRY.isPointInPolygon(vertex, face.vertices)) {
							isHidden = true;
							break;
						}
					}
				}
			}

			if (!isHidden) {
				const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				circle.setAttribute('cx', vertex.x);
				circle.setAttribute('cy', vertex.y);

				const isSelected = selectedVertices.find(v => v.id === vertex.id);
				const radius = isSelected ? 8 : 6;
				circle.setAttribute('r', radius * scaleFactor);

				circle.setAttribute('data-vertex-id', vertex.id);
				circle.classList.add('vertex-handle');
				if (vertex.isManual) {
					circle.classList.add('manual-vertex');
				}

				const baseStrokeWidth = 2;
				circle.style.strokeWidth = `${baseStrokeWidth * scaleFactor}px`;

				if (isSelected) {
					circle.classList.add('selected');
				}

				circle.addEventListener('mouseenter', () => circle.setAttribute('r', 8 * scaleFactor));
				circle.addEventListener('mouseleave', () => circle.setAttribute('r', (isSelected ? 8 : 6) * scaleFactor));

				this.elements.svg.appendChild(circle);
			}
		});

		const drawLabel = (text, x, y, offsetX = 15, offsetY = -15) => {
			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('x', x + offsetX * scaleFactor);
			label.setAttribute('y', y + offsetY * scaleFactor);
			label.textContent = text;
			label.classList.add('selection-label');
			label.style.fontSize = `${16 * scaleFactor}px`;
			label.style.strokeWidth = `${0.5 * scaleFactor}px`;
			this.elements.svg.appendChild(label);
		};

		if (axiomInfo.requiredPoints > 0) {
			switch (currentAxiom) {
				case 'AXIOM_1':
				case 'AXIOM_2':
					if (selectedVertices.length > 0) drawLabel('P1', selectedVertices[0].x, selectedVertices[0].y);
					if (selectedVertices.length > 1) drawLabel('P2', selectedVertices[1].x, selectedVertices[1].y);
					break;
				case 'AXIOM_3':
					if (selectedVertices.length >= 2) {
						const midX = (selectedVertices[0].x + selectedVertices[1].x) / 2;
						const midY = (selectedVertices[0].y + selectedVertices[1].y) / 2;
						drawLabel('L1', midX, midY);
					}
					if (selectedVertices.length >= 4) {
						const midX = (selectedVertices[2].x + selectedVertices[3].x) / 2;
						const midY = (selectedVertices[2].y + selectedVertices[3].y) / 2;
						drawLabel('L2', midX, midY);
					}
					break;
				case 'AXIOM_4':
					if (selectedVertices.length >= 2) {
						const midX = (selectedVertices[0].x + selectedVertices[1].x) / 2;
						const midY = (selectedVertices[0].y + selectedVertices[1].y) / 2;
						drawLabel('L', midX, midY);
					}
					if (selectedVertices.length >= 3) {
						drawLabel('P', selectedVertices[2].x, selectedVertices[2].y);
					}
					break;
				case 'AXIOM_5':
					if (selectedVertices.length > 0) drawLabel('P1', selectedVertices[0].x, selectedVertices[0].y);
					if (selectedVertices.length > 1) drawLabel('P2', selectedVertices[1].x, selectedVertices[1].y);
					if (selectedVertices.length >= 4) {
						const midX = (selectedVertices[2].x + selectedVertices[3].x) / 2;
						const midY = (selectedVertices[2].y + selectedVertices[3].y) / 2;
						drawLabel('L', midX, midY);
					}
					break;
				case 'AXIOM_6':
					if (selectedVertices.length > 0) drawLabel('P1', selectedVertices[0].x, selectedVertices[0].y);
					if (selectedVertices.length >= 3) {
						const midX = (selectedVertices[1].x + selectedVertices[2].x) / 2;
						const midY = (selectedVertices[1].y + selectedVertices[2].y) / 2;
						drawLabel('L1', midX, midY);
					}
					if (selectedVertices.length >= 4) drawLabel('P2', selectedVertices[3].x, selectedVertices[3].y);
					if (selectedVertices.length >= 6) {
						const midX = (selectedVertices[4].x + selectedVertices[5].x) / 2;
						const midY = (selectedVertices[4].y + selectedVertices[5].y) / 2;
						drawLabel('L2', midX, midY);
					}
					break;
				case 'AXIOM_7':
					if (selectedVertices.length > 0) drawLabel('P1', selectedVertices[0].x, selectedVertices[0].y);
					if (selectedVertices.length >= 3) {
						const midX = (selectedVertices[1].x + selectedVertices[2].x) / 2;
						const midY = (selectedVertices[1].y + selectedVertices[2].y) / 2;
						drawLabel('L1', midX, midY);
					}
					if (selectedVertices.length >= 5) {
						const midX = (selectedVertices[3].x + selectedVertices[4].x) / 2;
						const midY = (selectedVertices[3].y + selectedVertices[4].y) / 2;
						drawLabel('L2', midX, midY);
					}
					break;
			}
		}
		
		if (state.cursorPosition) {
			this.elements.cursorPositionValueEl.textContent = `${state.cursorPosition.x.toFixed(2)}, ${state.cursorPosition.y.toFixed(2)}`;
		} else {
			this.elements.cursorPositionValueEl.textContent = '--';
		}
		this.elements.selectedPointsCountEl.textContent = selectedVertices.length;
		this.elements.requiredPointsCountEl.textContent = axiomInfo.requiredPoints;
		this.elements.faceCountEl.textContent = mesh.faces.length;
		this.elements.vertexCountEl.textContent = mesh.vertices.length;
		this.elements.currentToolNameEl.textContent = t(axiomInfo.nameKey);
		
		const prompt = t(axiomInfo.prompts(selectedVertices));
		this.elements.currentToolDescEl.innerHTML = `<strong>${t('instructionLabel')}:</strong> ${prompt}<hr>${t(axiomInfo.descKey)}`;

		const isAxiom6Ready = currentAxiom === 'AXIOM_6' && selectedVertices.length === axiomInfo.requiredPoints;
		const foldButtonsDisabled = isProcessing || currentAxiom === 'TOOL_ADD_POINT' || 
			(selectedVertices.length !== axiomInfo.requiredPoints) ||
			(isAxiom6Ready && selectedAxiom6SolutionIndex === null);

		this.elements.foldValleyButton.disabled = foldButtonsDisabled;
		this.elements.foldMountainButton.disabled = foldButtonsDisabled;
		this.elements.flipButton.disabled = isProcessing;
		this.elements.recenterViewButton.disabled = isProcessing;
		this.elements.undoButton.disabled = isProcessing || historyIndex <= 0;
		this.elements.redoButton.disabled = isProcessing || historyIndex >= history.length - 1;
		this.elements.resetButton.disabled = isProcessing;
		this.elements.xrayButton.disabled = isProcessing;

		for (const axiomId in this.elements.axiomButtons) {
			this.elements.axiomButtons[axiomId].classList.toggle('active', axiomId === currentAxiom);
		}

		const progressPercentage = axiomInfo.requiredPoints > 0 ? (selectedVertices.length / axiomInfo.requiredPoints) * 100 : 0;
		this.elements.selectionProgressBar.style.width = `${progressPercentage}%`;

		this.elements.historyListEl.innerHTML = '';
		history.slice(1).forEach((histItem, index) => {
			const li = document.createElement('li');
			const historyItemIndex = index + 1;
			li.textContent = `${historyItemIndex}: ${t(histItem.action.key, histItem.action.params)}`;
			li.dataset.historyIndex = historyItemIndex;
			if (historyItemIndex === historyIndex) {
				li.classList.add('active');
			}
			this.elements.historyListEl.appendChild(li);
		});
	},
	
	updateStaticTexts() {
		document.querySelectorAll('[data-i18n]').forEach(el => {
			const key = el.dataset.i18n;
			el.innerHTML = t(key);
		});
		this.elements.langButtons.forEach(button => {
			button.classList.toggle('active', button.dataset.lang === AppState.currentLanguage);
		});
	},
	
	displayError(message, duration = 5000) {
		if (!this.elements.errorMessageEl) return;
		this.elements.errorMessageEl.textContent = message || '';
		
		if (message) {
			setTimeout(() => {
				if (this.elements.errorMessageEl.textContent === message) {
					this.elements.errorMessageEl.textContent = '';
				}
			}, duration);
		}
	}
};

// SECTION: APPLICATION CONTROLLER
const AppController = {
	init() {
		UI.init(this);
		if (!this.loadStateFromLocalStorage()) {
			AppState.init();
		}
		this.applyLayoutState();
		document.documentElement.lang = AppState.currentLanguage;
		UI.updateStaticTexts();
		UI.render(AppState);
	},

	handlePanStart(event) {
		if (AppState.activeResizer) return;
		if (event.button !== 1 || event.target.classList.contains('vertex-handle')) return;
		event.preventDefault();
		AppState.isPanning = true;
		AppState.panStartPoint = { x: event.clientX, y: event.clientY };
		AppState.dragOccurred = false;
	},

	handlePanMove(event) {
		if (!AppState.isPanning) return;
		event.preventDefault();
		AppState.dragOccurred = true;

		const dx = event.clientX - AppState.panStartPoint.x;
		const dy = event.clientY - AppState.panStartPoint.y;
		
		const scale = AppState.viewBox.width / UI.elements.svg.clientWidth;

		AppState.viewBox.x -= dx * scale;
		AppState.viewBox.y -= dy * scale;

		UI.elements.svg.setAttribute('viewBox', `${AppState.viewBox.x} ${AppState.viewBox.y} ${AppState.viewBox.width} ${AppState.viewBox.height}`);

		AppState.panStartPoint = { x: event.clientX, y: event.clientY };
		this.saveStateToLocalStorage();
	},

	handleMouseMove(event) {
		if (AppState.activeResizer) return;

		if (AppState.isPanning) {
			event.preventDefault();
			AppState.dragOccurred = true;

			const dx = event.clientX - AppState.panStartPoint.x;
			const dy = event.clientY - AppState.panStartPoint.y;
			
			const scale = AppState.viewBox.width / UI.elements.svg.clientWidth;

			AppState.viewBox.x -= dx * scale;
			AppState.viewBox.y -= dy * scale;

			AppState.panStartPoint = { x: event.clientX, y: event.clientY };
			
			UI.render(AppState);
			return;
		}

		const svgRect = UI.elements.svg.getBoundingClientRect();
		const scale = AppState.viewBox.width / svgRect.width;
		const mouseX = AppState.viewBox.x + (event.clientX - svgRect.left) * scale;
		const mouseY = AppState.viewBox.y + (event.clientY - svgRect.top) * scale;
		AppState.cursorPosition = { x: mouseX, y: mouseY };

		if (AppState.currentAxiom === 'TOOL_ADD_POINT') {
			const potentialPoint = this.getSnapPoint(mouseX, mouseY, event.shiftKey, scale);
			const isInside = AppState.mesh.faces.some(face => GEOMETRY.isPointInPolygon(potentialPoint, face.vertices));

			if (isInside) {
				AppState.previewPoint = potentialPoint;
			} else {
				AppState.previewPoint = null;
			}
		} else {
			if (AppState.previewPoint) {
				AppState.previewPoint = null;
			}
		}
		
		UI.render(AppState);
	},
	
	getSnapPoint(x, y, shiftPressed, scale) {
		if (shiftPressed) return { x, y, snapLine: null };

		const SNAP_RADIUS_SQ = (15 * scale) ** 2;
		let bestSnap = { x, y, snapLine: null, distSq: Infinity };
		const mousePos = { x, y };

		const updateBestSnap = (point, line, distSq) => {
			if (point && distSq < bestSnap.distSq && distSq < SNAP_RADIUS_SQ) {
				bestSnap = { x: point.x, y: point.y, snapLine: line, distSq };
			}
		};
		
		const allEdges = new Map();
		AppState.mesh.faces.forEach(face => {
			for (let i = 0; i < face.vertices.length; i++) {
				const v1 = face.vertices[i];
				const v2 = face.vertices[(i + 1) % face.vertices.length];
				const key = [v1.id, v2.id].sort().join('-');
				if (!allEdges.has(key)) allEdges.set(key, { p1: v1, p2: v2 });
			}
		});

		const faceDiagonals = [];
		AppState.mesh.faces.forEach(face => {
			const v = face.vertices;
			if (v.length > 3) {
				for (let i = 0; i < v.length; i++) {
					for (let j = i + 2; j < v.length; j++) {
						if (i === 0 && j === v.length - 1) continue;
						faceDiagonals.push({ p1: v[i], p2: v[j] });
					}
				}
			}
		});
		
		const constructionLines = [
			...Array.from(allEdges.values()), 
			...AppState.mesh.creases,
			...faceDiagonals
		];

		const candidatePoints = new Set();
		
		AppState.mesh.vertices.forEach(v => candidatePoints.add(v));
		
		constructionLines.forEach(line => {
			const midPoint = { x: (line.p1.x + line.p2.x) / 2, y: (line.p1.y + line.p2.y) / 2 };
			candidatePoints.add(midPoint);
		});

		for (let i = 0; i < constructionLines.length; i++) {
			for (let j = i + 1; j < constructionLines.length; j++) {
				const intersection = GEOMETRY.getInfiniteLineIntersection(
					constructionLines[i].p1, constructionLines[i].p2, 
					constructionLines[j].p1, constructionLines[j].p2
				);
				if (intersection) {
					candidatePoints.add(intersection);
				}
			}
		}

		candidatePoints.forEach(p => {
			updateBestSnap(p, null, GEOMETRY.distSq(mousePos, p));
		});

		if (bestSnap.distSq === Infinity) {
			constructionLines.forEach(line => {
				const closest = GEOMETRY.getClosestPointOnLineSegment(mousePos, line.p1, line.p2);
				updateBestSnap(closest, line, GEOMETRY.distSq(mousePos, closest));
			});
		}
		
		return { x: bestSnap.x, y: bestSnap.y, snapLine: bestSnap.snapLine };
	},
	
	handlePanEnd() {
		if (AppState.activeResizer) {
			this.handleResizeEnd();
		}
		AppState.isPanning = false;
	},

	handleMouseLeave() {
		this.handlePanEnd();
		AppState.cursorPosition = null;
		UI.render(AppState);
	},

	handleZoom(event) {
		event.preventDefault();
		const zoomIntensity = 0.1;
		const direction = event.deltaY < 0 ? 1 : -1;
		const scale = 1 - direction * zoomIntensity;

		const svgRect = UI.elements.svg.getBoundingClientRect();
		const mouseX = event.clientX - svgRect.left;
		const mouseY = event.clientY - svgRect.top;

		const viewBoxMouseX = AppState.viewBox.x + mouseX * (AppState.viewBox.width / svgRect.width);
		const viewBoxMouseY = AppState.viewBox.y + mouseY * (AppState.viewBox.height / svgRect.height);

		AppState.viewBox.width *= scale;
		AppState.viewBox.height *= scale;
		AppState.viewBox.x = viewBoxMouseX - mouseX * (AppState.viewBox.width / svgRect.width);
		AppState.viewBox.y = viewBoxMouseY - mouseY * (AppState.viewBox.height / svgRect.height);

		UI.render(AppState);
		this.saveStateToLocalStorage();
	},

	handleSVGClick(event) {
		if (AppState.activeResizer || AppState.isProcessing || AppState.dragOccurred) return;
		UI.displayError('');
		
		const svgRect = UI.elements.svg.getBoundingClientRect();
		const scale = AppState.viewBox.width / svgRect.width;
		const clickX = AppState.viewBox.x + (event.clientX - svgRect.left) * scale;
		const clickY = AppState.viewBox.y + (event.clientY - svgRect.top) * scale;
		
		if (AppState.currentAxiom === 'AXIOM_6' && AppState.axiom6Solutions.length > 0) {
			let closestLineIndex = -1;
			let minDistanceSq = Infinity;
			const clickPoint = { x: clickX, y: clickY };
			
			AppState.axiom6Solutions.forEach((line, index) => {
				const closestPointOnLine = GEOMETRY.getClosestPointOnLineSegment(clickPoint, line.p1, line.p2);
				const distSq = GEOMETRY.distSq(clickPoint, closestPointOnLine);
				
				if (distSq < minDistanceSq) {
					minDistanceSq = distSq;
					closestLineIndex = index;
				}
			});

			if (closestLineIndex !== -1 && minDistanceSq < (20 * scale) ** 2) {
				AppState.selectedAxiom6SolutionIndex = closestLineIndex;
				UI.render(AppState);
				return;
			}
		}

		if (AppState.currentAxiom === 'TOOL_ADD_POINT') {
			const pointToAdd = AppState.previewPoint ? new Vertex(AppState.previewPoint.x, AppState.previewPoint.y, true) : new Vertex(clickX, clickY, true);
			
			for (const v of AppState.mesh.vertices) {
				if (GEOMETRY.distSq(pointToAdd, v) < EPSILON) {
					UI.displayError(t('errorPointExists'));
					return;
				}
			}

			const isInside = AppState.mesh.faces.some(face => GEOMETRY.isPointInPolygon(pointToAdd, face.vertices));

			if (isInside) {
				const newMesh = cloneMesh(AppState.mesh);
				newMesh.vertices.push(pointToAdd);
				
				AppState.mesh = newMesh;
				const action = { key: 'historyAddPoint' };
				AppState.history = AppState.history.slice(0, AppState.historyIndex + 1);
				AppState.history.push({ mesh: cloneMesh(AppState.mesh), action: action });
				AppState.historyIndex++;
				this.saveStateToLocalStorage();
				UI.render(AppState);
			}
			return;
		}

		if (event.target.classList.contains('edge-handle')) {
			const v1Id = event.target.getAttribute('data-v1-id');
			const v2Id = event.target.getAttribute('data-v2-id');
			const v1 = AppState.mesh.vertices.find(v => v.id === v1Id);
			const v2 = AppState.mesh.vertices.find(v => v.id === v2Id);
			if (v1 && v2) {
				AppState.selectVertex(v1, true, v2);
				UI.render(AppState);
			}
			return;
		}

		const CLICK_RADIUS_SQ = (10 * scale) ** 2;
		const candidates = AppState.mesh.vertices.filter(v =>
			GEOMETRY.distSq(v, { x: clickX, y: clickY }) < CLICK_RADIUS_SQ
		);

		if (candidates.length > 0) {
			candidates.sort((a, b) => a.id.localeCompare(b.id));

			const isSameSpot = AppState.selectionCandidates.length === candidates.length &&
				AppState.selectionCandidates.every((c, i) => c.id === candidates[i].id);

			if (isSameSpot) {
				AppState.selectionCandidateIndex = (AppState.selectionCandidateIndex + 1);
			} else {
				AppState.selectionCandidateIndex = 0;
				AppState.selectionCandidates = candidates;
			}
			
			const vertexToSelect = AppState.selectionCandidates[AppState.selectionCandidateIndex % AppState.selectionCandidates.length];
			if(vertexToSelect) {
				AppState.selectVertex(vertexToSelect);
				if (AppState.currentAxiom === 'AXIOM_6' && AppState.selectedVertices.length === 6) {
					const solutions = AXIOMS['AXIOM_6'].getFoldLines(AppState.selectedVertices);
					if (solutions.error) {
						UI.displayError(t(solutions.error));
						AppState.axiom6Solutions = [];
					} else {
						AppState.axiom6Solutions = solutions;
					}
				}
			}
		}
		
		UI.render(AppState);
	},
	
	isSegmentAnEdge(p1, p2, mesh) {
		for (const face of mesh.faces) {
			for (let i = 0; i < face.vertices.length; i++) {
				const v1 = face.vertices[i];
				const v2 = face.vertices[(i + 1) % face.vertices.length];
				if ((v1.id === p1.id && v2.id === p2.id) || (v1.id === p2.id && v2.id === p1.id)) {
					return true;
				}
			}
		}
		return false;
	},
	
	executeFold(foldDirection) {
		const axiom = AXIOMS[AppState.currentAxiom];
		if (AppState.isProcessing || AppState.selectedVertices.length !== axiom.requiredPoints) return;
		
		let foldLine;
		if (AppState.currentAxiom === 'AXIOM_6') {
			if (AppState.selectedAxiom6SolutionIndex === null) return;
			foldLine = AppState.axiom6Solutions[AppState.selectedAxiom6SolutionIndex];
		} else {
			foldLine = axiom.getFoldLine(AppState.selectedVertices);
		}

		if (!foldLine || foldLine.error) {
			UI.displayError(t(foldLine?.error || 'errorInvalidFold'));
			return;
		}

		for (const crease of AppState.mesh.creases) {
			const intersectionPoint = GEOMETRY.getInfiniteLineIntersection(foldLine.p1, foldLine.p2, crease.p1, crease.p2);
			if (intersectionPoint) {
				let intersectingCreaseCount = 1;
				for (const otherCrease of AppState.mesh.creases) {
					if (crease === otherCrease) continue;
					if (Math.abs(GEOMETRY.getLineSide(intersectionPoint, otherCrease.p1, otherCrease.p2)) < EPSILON) {
						intersectingCreaseCount++;
					}
				}
				if (intersectingCreaseCount >= 2) {
					UI.displayError(t('errorInvalidIntersection'));
					return;
				}
			}
		}

		const vertexEdgeCount = new Map();
		AppState.mesh.vertices.forEach(v => vertexEdgeCount.set(v.id, new Set()));
		
		const allEdges = new Set();
		AppState.mesh.faces.forEach(face => {
			for (let i = 0; i < face.vertices.length; i++) {
				const v1 = face.vertices[i];
				const v2 = face.vertices[(i + 1) % face.vertices.length];
				const key = [v1.id, v2.id].sort().join('-');
				if (!allEdges.has(key)) {
					allEdges.add(key);
					vertexEdgeCount.get(v1.id).add(v2.id);
					vertexEdgeCount.get(v2.id).add(v1.id);
				}
			}
		});

		for (const vertex of AppState.mesh.vertices) {
			if ((vertexEdgeCount.get(vertex.id)?.size ?? 0) > 2) {
				if (Math.abs(GEOMETRY.getLineSide(vertex, foldLine.p1, foldLine.p2)) < EPSILON) {
					UI.displayError(t('errorInvalidIntersection'));
					return;
				}
			}
		}
		
		if (AppState.currentAxiom === 'AXIOM_1') {
			const [p1, p2] = AppState.selectedVertices;
			if (this.isSegmentAnEdge(p1, p2, AppState.mesh)) {
				UI.displayError(t('errorFoldOnEdge'));
				return;
			}
		}

		AppState.isProcessing = true;
		UI.render(AppState);

		let mobilePoint = null;
		const [p1, p2, , p4] = AppState.selectedVertices;
		switch (AppState.currentAxiom) {
			case 'AXIOM_2': mobilePoint = p1; break;
			case 'AXIOM_3': mobilePoint = p1; break;
			case 'AXIOM_5': mobilePoint = p2; break;
			case 'AXIOM_6': mobilePoint = p1; break;
			case 'AXIOM_7': mobilePoint = p1; break;
		}
		
		let topmostFace = null;
		if (mobilePoint) {
			const sortedFaces = [...AppState.mesh.faces].sort((a, b) => b.layer - a.layer);
			for (const face of sortedFaces) {
				if (GEOMETRY.isPointInPolygon(mobilePoint, face.vertices)) {
					topmostFace = face;
					break;
				}
			}
		}

		const foldResult = FoldEngine.performFold(AppState.mesh, foldLine, foldDirection, mobilePoint, topmostFace);
		
		if (foldResult.mesh) {
			UI.displayError('');
			AppState.mesh = foldResult.mesh;
			const foldTypeName = t(foldDirection === 'valley' ? 'foldValley' : 'foldMountain');
			const action = { 
				key: 'historyFold', 
				params: { 
					axiomName: t(AXIOMS[AppState.currentAxiom].nameKey),
					foldTypeName: foldTypeName,
				}
			};
			AppState.history = AppState.history.slice(0, AppState.historyIndex + 1);
			AppState.history.push({ mesh: cloneMesh(AppState.mesh), action: action });
			AppState.historyIndex++;
		} else if (foldResult.error) {
			UI.displayError(t(foldResult.error));
		}

		AppState.clearSelection();
		AppState.isProcessing = false;
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},
	
	recenterView() {
		if (AppState.isProcessing || AppState.mesh.vertices.length === 0) return;

		const vertices = AppState.mesh.vertices;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

		vertices.forEach(v => {
			minX = Math.min(minX, v.x);
			minY = Math.min(minY, v.y);
			maxX = Math.max(maxX, v.x);
			maxY = Math.max(maxY, v.y);
		});

		const modelWidth = maxX - minX;
		const modelHeight = maxY - minY;
		
		if (modelWidth < EPSILON || modelHeight < EPSILON) return;

		const PADDING = 1.2;
		const container = UI.elements.svg.parentElement;
		const containerAspectRatio = container.clientWidth / container.clientHeight;

		let viewBoxWidth, viewBoxHeight;

		if (modelWidth / modelHeight > containerAspectRatio) {
			viewBoxWidth = modelWidth * PADDING;
			viewBoxHeight = viewBoxWidth / containerAspectRatio;
		} else {
			viewBoxHeight = modelHeight * PADDING;
			viewBoxWidth = viewBoxHeight * containerAspectRatio;
		}

		AppState.viewBox.width = viewBoxWidth;
		AppState.viewBox.height = viewBoxHeight;
		AppState.viewBox.x = minX - (viewBoxWidth - modelWidth) / 2;
		AppState.viewBox.y = minY - (viewBoxHeight - modelHeight) / 2;
		
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},
	
	toggleXRay() {
		if (AppState.isProcessing) return;
		AppState.isXRayMode = !AppState.isXRayMode;
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},

	flipPaper() {
		if (AppState.isProcessing) return;

		if (AppState.historyIndex > 0 && AppState.history[AppState.historyIndex]?.action?.key === 'historyFlip') {
			AppState.history.pop();
			AppState.historyIndex--;
			AppState.mesh = cloneMesh(AppState.history[AppState.historyIndex].mesh);
			
			AppState.clearSelection();
			this.saveStateToLocalStorage();
			UI.render(AppState);
			return;
		}

		const activeVertices = new Map();
		AppState.mesh.faces.forEach(face => {
			face.vertices.forEach(v => {
				if (!activeVertices.has(v.id)) {
					activeVertices.set(v.id, v);
				}
			});
		});
		
		const verticesToConsider = activeVertices.size > 0 ? Array.from(activeVertices.values()) : AppState.mesh.vertices;

		if (verticesToConsider.length > 0) {
			const xCoords = verticesToConsider.map(v => v.x);
			const minX = Math.min(...xCoords);
			const maxX = Math.max(...xCoords);
			const centerX = (minX + maxX) / 2;

			AppState.mesh.vertices.forEach(vertex => {
				vertex.x = 2 * centerX - vertex.x;
			});

			AppState.mesh.creases.forEach(crease => {
				crease.p1.x = 2 * centerX - crease.p1.x;
				crease.p2.x = 2 * centerX - crease.p2.x;
			});
		}

		if (AppState.mesh.faces.length > 0) {
			const layers = AppState.mesh.faces.map(f => f.layer);
			const minLayer = Math.min(...layers);
			const maxLayer = Math.max(...layers);

			AppState.mesh.faces.forEach(face => {
				face.isRecto = !face.isRecto;
				face.layer = minLayer + maxLayer - face.layer;
				face.vertices.reverse();
			});
		}
		
		const action = { key: 'historyFlip' };
		AppState.history = AppState.history.slice(0, AppState.historyIndex + 1);
		AppState.history.push({ mesh: cloneMesh(AppState.mesh), action: action });
		AppState.historyIndex++;
		
		AppState.clearSelection();
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},
	
	changeLanguage(lang) {
		if (AppState.isProcessing || !translations[lang]) return;
		AppState.currentLanguage = lang;
		document.documentElement.lang = lang;
		UI.updateStaticTexts();
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},
	
	undo() {
		if (AppState.isProcessing) return;
		AppState.undo();
		AppState.clearSelection();
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},

	redo() {
		if (AppState.isProcessing) return;
		AppState.redo();
		AppState.clearSelection();
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},

	reset() {
		if (AppState.isProcessing) return;
		AppState.init();
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},
	
	changeAxiom(axiomId) {
		if (AppState.isProcessing) return;
		AppState.currentAxiom = axiomId;
		AppState.clearSelection();
		AppState.previewPoint = null;
		UI.displayError('');
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},

	handleHistoryClick(event) {
		const targetLi = event.target.closest('li[data-history-index]');
		if (!targetLi || AppState.isProcessing) return;

		const index = parseInt(targetLi.dataset.historyIndex, 10);
		if (!isNaN(index)) {
			this.jumpToHistoryState(index);
		}
	},

	jumpToHistoryState(index) {
		if (AppState.isProcessing || index < 0 || index >= AppState.history.length) return;

		AppState.historyIndex = index;
		AppState.mesh = cloneMesh(AppState.history[AppState.historyIndex].mesh);
		AppState.clearSelection();
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},
	
	toggleToolbar() {
		AppState.isToolbarCollapsed = !AppState.isToolbarCollapsed;
		document.body.classList.toggle('left-panel-collapsed', AppState.isToolbarCollapsed);
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},

	toggleInfoPanel() {
		AppState.isInfoPanelCollapsed = !AppState.isInfoPanelCollapsed;
		document.body.classList.toggle('right-panel-collapsed', AppState.isInfoPanelCollapsed);
		this.saveStateToLocalStorage();
		UI.render(AppState);
	},

	handleResizeStart(event, resizer) {
		event.preventDefault();
		AppState.activeResizer = resizer;
		document.body.classList.add('is-resizing');
		this.boundResizeMove = this.handleResizeMove.bind(this);
		this.boundResizeEnd = this.handleResizeEnd.bind(this);
		window.addEventListener('mousemove', this.boundResizeMove);
		window.addEventListener('mouseup', this.boundResizeEnd);
	},

	handleResizeMove(event) {
		if (!AppState.activeResizer) return;
		
		console.group(`Resize Move: ${AppState.activeResizer}`);
		
		const MIN_PANEL_WIDTH = 150;
		const windowWidth = window.innerWidth;
		const minCanvasWidth = windowWidth * 0.6;

		console.log(`Window Width (F): ${windowWidth}px, Min Canvas Width (C_min): ${minCanvasWidth.toFixed(2)}px`);

		if (AppState.activeResizer === 'left') {
			const rightPanelWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--layout-panel-width')) || 0;
			const maxLeftPanelWidth = windowWidth - rightPanelWidth - minCanvasWidth;
			const desiredWidth = event.clientX;
			
			const effectiveMinWidth = Math.min(MIN_PANEL_WIDTH, Math.max(0, maxLeftPanelWidth));
			const clampedWidth = Math.max(effectiveMinWidth, Math.min(desiredWidth, maxLeftPanelWidth));

			console.log(`Right Panel (D): ${rightPanelWidth.toFixed(2)}px`);
			console.log(`Max Left Panel Width (G_max = F-D-C_min): ${maxLeftPanelWidth.toFixed(2)}px`);
			console.log(`Desired Left Width (Mouse X): ${desiredWidth}px`);
			console.log(`Effective Min Width: ${effectiveMinWidth.toFixed(2)}px`);
			console.log(`--- FINAL Clamped Left Width: ${clampedWidth.toFixed(2)}px ---`);
			
			document.documentElement.style.setProperty('--layout-toolbar-width', `${clampedWidth}px`);

		} else if (AppState.activeResizer === 'right') {
			const leftPanelWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--layout-toolbar-width')) || 0;
			const maxRightPanelWidth = windowWidth - leftPanelWidth - minCanvasWidth;
			const desiredWidth = windowWidth - event.clientX;

			const effectiveMinWidth = Math.min(MIN_PANEL_WIDTH, Math.max(0, maxRightPanelWidth));
			const clampedWidth = Math.max(effectiveMinWidth, Math.min(desiredWidth, maxRightPanelWidth));

			console.log(`Left Panel (G): ${leftPanelWidth.toFixed(2)}px`);
			console.log(`Max Right Panel Width (D_max = F-G-C_min): ${maxRightPanelWidth.toFixed(2)}px`);
			console.log(`Desired Right Width (F - Mouse X): ${desiredWidth.toFixed(2)}px`);
			console.log(`Effective Min Width: ${effectiveMinWidth.toFixed(2)}px`);
			console.log(`--- FINAL Clamped Right Width: ${clampedWidth.toFixed(2)}px ---`);

			document.documentElement.style.setProperty('--layout-panel-width', `${clampedWidth}px`);
		}
		
		console.groupEnd();
		UI.render(AppState);
	},

	handleResizeEnd() {
		if (!AppState.activeResizer) return;
		AppState.activeResizer = null;
		document.body.classList.remove('is-resizing');
		window.removeEventListener('mousemove', this.boundResizeMove);
		window.removeEventListener('mouseup', this.boundResizeEnd);
		this.saveStateToLocalStorage();
	},
	
	applyLayoutState() {
		const rootStyle = document.documentElement.style;
		const computedStyle = getComputedStyle(document.documentElement);

		rootStyle.setProperty('--layout-toolbar-width', AppState.layout?.toolbarWidth || computedStyle.getPropertyValue('--layout-toolbar-width'));
		rootStyle.setProperty('--layout-panel-width', AppState.layout?.panelWidth || computedStyle.getPropertyValue('--layout-panel-width'));

		document.body.classList.toggle('left-panel-collapsed', AppState.isToolbarCollapsed);
		document.body.classList.toggle('right-panel-collapsed', AppState.isInfoPanelCollapsed);
	},
	
	saveStateToLocalStorage() {
		try {
			const stateToSave = {
				history: AppState.history,
				historyIndex: AppState.historyIndex,
				currentAxiom: AppState.currentAxiom,
				isXRayMode: AppState.isXRayMode,
				viewBox: AppState.viewBox,
				currentLanguage: AppState.currentLanguage,
				isToolbarCollapsed: AppState.isToolbarCollapsed,
				isInfoPanelCollapsed: AppState.isInfoPanelCollapsed,
				layout: {
					toolbarWidth: getComputedStyle(document.documentElement).getPropertyValue('--layout-toolbar-width'),
					panelWidth: getComputedStyle(document.documentElement).getPropertyValue('--layout-panel-width'),
				}
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
		} catch (error) {
			console.error("Could not save state to localStorage:", error);
		}
	},

	loadStateFromLocalStorage() {
		try {
			const savedStateJSON = localStorage.getItem(STORAGE_KEY);
			if (!savedStateJSON) return false;

			const savedState = JSON.parse(savedStateJSON);

			AppState.history = savedState.history.map(histItem => ({
				...histItem,
				mesh: rehydrateMesh(histItem.mesh)
			}));
			AppState.historyIndex = savedState.historyIndex;
			AppState.mesh = cloneMesh(AppState.history[AppState.historyIndex].mesh);
			AppState.currentAxiom = savedState.currentAxiom || 'AXIOM_2';
			AppState.isXRayMode = savedState.isXRayMode || false;
			AppState.viewBox = savedState.viewBox;
			AppState.currentLanguage = savedState.currentLanguage || 'en';
			AppState.isToolbarCollapsed = savedState.isToolbarCollapsed || false;
			AppState.isInfoPanelCollapsed = savedState.isInfoPanelCollapsed || false;
			AppState.layout = savedState.layout || {};
			
			AppState.selectedVertices = [];
			AppState.isProcessing = false;

			return true;
		} catch (error) {
			console.error("Could not load state from localStorage:", error);
			return false;
		}
	},
};

// Start the application
AppController.init();