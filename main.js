// SECTION: DATA CLASSES
let uniqueIdCounter = 0;
const generateUniqueId = () => `id_${uniqueIdCounter++}`;

class Vertex {
	constructor(x, y) {
		this.x = x;
		this.y = y;
		this.id = generateUniqueId();
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
		const newV = new Vertex(v.x, v.y);
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

// SECTION: GEOMETRY UTILS
const GEOMETRY = {
	getLineSide(p, lineP1, lineP2) {
		return (lineP2.x - lineP1.x) * (p.y - lineP1.y) - (lineP2.y - lineP1.y) * (p.x - lineP1.x);
	},

	getLineIntersection(p1, p2, p3, p4) {
		const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
		if (Math.abs(den) < 1e-9) return null;
		const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
		const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
		
		if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
			return new Vertex(p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
		}
		return null;
	},
	
	reflectPoint(point, lineP1, lineP2) {
		const A = lineP2.y - lineP1.y;
		const B = lineP1.x - lineP2.x;
		const C = -A * lineP1.x - B * lineP1.y;
		const den = A * A + B * B;
		if (den < 1e-9) return new Vertex(point.x, point.y);

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
		if (d1 < 1e-9 || d2 < 1e-9) return [];

		const l1n = { A: l1.A / d1, B: l1.B / d1, C: l1.C / d1 };
		const l2n = { A: l2.A / d2, B: l2.B / d2, C: l2.C / d2 };

		const createLine = (A, B, C) => {
			if (Math.abs(A) < 1e-9 && Math.abs(B) < 1e-9) return null;
			const dir = { x: -B, y: A };
			const p0 = Math.abs(B) > 1e-9 ? new Vertex(0, -C / B) : new Vertex(-C / A, 0);
			const p1 = new Vertex(p0.x - dir.x * 1000, p0.y - dir.y * 1000);
			const p2 = new Vertex(p0.x + dir.x * 1000, p0.y + dir.y * 1000);
			return { p1, p2 };
		};
		
		if (Math.abs(l1n.A * l2n.B - l1n.B * l2n.A) < 1e-9) {
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

	getLineCircleIntersection(lineP1, lineP2, circleCenter, radius) {
		const d = { x: lineP2.x - lineP1.x, y: lineP2.y - lineP1.y };
		const f = { x: lineP1.x - circleCenter.x, y: lineP1.y - circleCenter.y };

		const a = d.x * d.x + d.y * d.y;
		const b = 2 * (f.x * d.x + f.y * d.y);
		const c = f.x * f.x + f.y * f.y - radius * radius;

		let discriminant = b * b - 4 * a * c;
		if (discriminant < 1e-9) {
			return [];
		}
		
		discriminant = Math.sqrt(discriminant);
		const t1 = (-b - discriminant) / (2 * a);
		const t2 = (-b + discriminant) / (2 * a);

		const solutions = [
			new Vertex(lineP1.x + t1 * d.x, lineP1.y + t1 * d.y),
			new Vertex(lineP1.x + t2 * d.x, lineP1.y + t2 * d.y)
		];
		
		if (Math.abs(discriminant) < 1e-9) solutions.pop();
		return solutions;
	}
};

// SECTION: AXIOMS CONFIGURATION
const AXIOMS = {
	'AXIOM_1': {
		name: 'Axiome 1',
		desc: 'Plier par une ligne passant par deux points.',
		requiredPoints: 2,
		prompts: [
			'Sélectionnez le premier point.',
			'Sélectionnez le second point pour définir la ligne de pli.'
		],
		getFoldLine: (points) => {
			const [p1, p2] = points;
			if (GEOMETRY.distSq(p1, p2) < 1e-9) return null;
			const vec = new Vertex(p2.x - p1.x, p2.y - p1.y);
			const pA = new Vertex(p1.x - vec.x * 1000, p1.y - vec.y * 1000);
			const pB = new Vertex(p1.x + vec.x * 1000, p1.y + vec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_2': {
		name: 'Axiome 2',
		desc: 'Plier un point sur un autre. L\'ordre de sélection détermine le côté mobile.',
		requiredPoints: 2,
		prompts: [
			'Sélectionnez le point à déplacer.',
			'Sélectionnez le point de destination.'
		],
		getFoldLine: (points) => {
			const [p1, p2] = points;
			const midPoint = new Vertex((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
			const vec = new Vertex(p2.x - p1.x, p2.y - p1.y);
			const perpendicularVec = new Vertex(-vec.y, vec.x);
			
			const pA = new Vertex(midPoint.x - perpendicularVec.x * 1000, midPoint.y - perpendicularVec.y * 1000);
			const pB = new Vertex(midPoint.x + perpendicularVec.x * 1000, midPoint.y + perpendicularVec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_3': {
		name: 'Axiome 3',
		desc: 'Plier une ligne sur une autre (sélectionner 2 pts ou une arête par ligne).',
		requiredPoints: 4,
		prompts: [
			'Sélectionnez le premier point de la Ligne 1 (ou une arête).',
			'Sélectionnez le second point de la Ligne 1.',
			'Sélectionnez le premier point de la Ligne 2 (ou une arête).',
			'Sélectionnez le second point de la Ligne 2.'
		],
		getFoldLine: (points) => {
			const [l1p1, l1p2, l2p1, l2p2] = points;
			const bisectors = GEOMETRY.getAngleBisector(l1p1, l1p2, l2p1, l2p2);
			if (bisectors.length === 0) return null;

			const bisector = bisectors[0];
			const side1 = GEOMETRY.getLineSide(l1p1, bisector.p1, bisector.p2);
			const side2 = GEOMETRY.getLineSide(l2p1, bisector.p1, bisector.p2);
			
			if (side1 * side2 > 1e-9 && bisectors.length > 1) {
				return bisectors[1];
			}
			return bisector;
		}
	},
	'AXIOM_4': {
		name: 'Axiome 4',
		desc: 'Plier une ligne perpendiculairement à une autre, passant par un point.',
		requiredPoints: 3,
		prompts: [
			'Sélectionnez le premier point de la ligne (ou une arête).',
			'Sélectionnez le second point de la ligne.',
			'Sélectionnez le point par lequel la pliure doit passer.'
		],
		getFoldLine: (points) => {
			const [l1p1, l1p2, p3] = points;
			const vec = new Vertex(l1p2.x - l1p1.x, l1p2.y - l1p1.y);
			const pVec = new Vertex(-vec.y, vec.x);
			const pA = new Vertex(p3.x - pVec.x * 1000, p3.y - pVec.y * 1000);
			const pB = new Vertex(p3.x + pVec.x * 1000, p3.y + pVec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_5': {
		name: 'Axiome 5',
		desc: 'Plier pour amener P2 sur la ligne L1, le long d\'une pliure passant par P1.',
		requiredPoints: 4,
		prompts: [
			'Sélectionnez le point P1 (pivot de la pliure).',
			'Sélectionnez le point P2 (à amener sur la ligne L1).',
			'Sélectionnez le premier point de la ligne L1 (ou une arête).',
			'Sélectionnez le second point de la ligne L1.'
		],
		getFoldLine: (points) => {
			const [p1, p2, l1p1, l1p2] = points;
			const radius = Math.sqrt(GEOMETRY.distSq(p1, p2));
			if (radius < 1e-9) return null;

			const intersections = GEOMETRY.getLineCircleIntersection(l1p1, l1p2, p1, radius);
			if (intersections.length === 0) return null;
			
			const p2prime = intersections[0];

			const midPoint = new Vertex((p2.x + p2prime.x) / 2, (p2.y + p2prime.y) / 2);
			const vec = new Vertex(p2prime.x - p2.x, p2prime.y - p2.y);
			const pVec = new Vertex(-vec.y, vec.x);

			const pA = new Vertex(midPoint.x - pVec.x * 1000, midPoint.y - pVec.y * 1000);
			const pB = new Vertex(midPoint.x + pVec.x * 1000, midPoint.y + pVec.y * 1000);
			return { p1: pA, p2: pB };
		}
	},
	'AXIOM_6': {
		name: 'Axiome 6',
		desc: 'Plier pour amener P1 sur L1 et P2 sur L2 (non implémenté).',
		requiredPoints: 6,
		prompts: [ 'Non implémenté.' ],
		getFoldLine: (points) => {
			console.warn("Axiome 6 n'est pas implémenté en raison de sa complexité géométrique.");
			return null;
		}
	}
};

// SECTION: FOLDING LOGIC
const FoldEngine = {
	performFold(mesh, foldLine, mobilePoint) {
		const { p1: foldLineP1, p2: foldLineP2 } = foldLine;
		const mobileSideSign = GEOMETRY.getLineSide(mobilePoint, foldLineP1, foldLineP2);

		if (Math.abs(mobileSideSign) < 1e-9) {
			console.warn("Le point mobile est sur la ligne de pli, pliage impossible.");
			return null;
		}

		const newMesh = new Mesh();
		const intersectionVertices = new Map();

		const splitFace = (face) => {
			const poly = face.vertices;
			const polySides = poly.map(p => GEOMETRY.getLineSide(p, foldLineP1, foldLineP2));
			
			if (polySides.every(s => Math.sign(s) === Math.sign(mobileSideSign) || Math.abs(s) < 1e-9) || 
				polySides.every(s => Math.sign(s) !== Math.sign(mobileSideSign) || Math.abs(s) < 1e-9)) {
				return [new Face([...face.vertices], face.layer, face.isRecto)];
			}
			
			const newPoly1 = [], newPoly2 = [];
			
			for (let i = 0; i < poly.length; i++) {
				const currentPoint = poly[i];
				const nextPoint = poly[(i + 1) % poly.length];
				const currentSide = polySides[i];
				const nextSide = polySides[(i + 1) % poly.length];

				if (currentSide >= 0) newPoly1.push(currentPoint);
				if (currentSide <= 0) newPoly2.push(currentPoint);

				if (currentSide * nextSide < 0) {
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

			const resultingFaces = [];
			if (newPoly1.length > 2) resultingFaces.push(new Face(newPoly1, face.layer, face.isRecto));
			if (newPoly2.length > 2) resultingFaces.push(new Face(newPoly2, face.layer, face.isRecto));
			return resultingFaces;
		};

		mesh.faces.forEach(face => {
			const splitResults = splitFace(face);
			newMesh.faces.push(...splitResults);
		});

		const allVertices = new Set();
		newMesh.faces.forEach(f => f.vertices.forEach(v => allVertices.add(v)));
		newMesh.vertices = Array.from(allVertices);

		const highestLayer = newMesh.faces.length > 0 ? Math.max(...newMesh.faces.map(f => f.layer)) : 0;
		const mobileVertices = new Set();
		
		newMesh.faces.forEach(face => {
			const centroidX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
			const centroidY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
			
			if (GEOMETRY.getLineSide({x: centroidX, y: centroidY}, foldLineP1, foldLineP2) * mobileSideSign > 1e-9) {
				face.layer = highestLayer + 1;
				face.isRecto = !face.isRecto;
				face.vertices.forEach(v => mobileVertices.add(v));
			}
		});
		
		mobileVertices.forEach(v => {
			const reflected = GEOMETRY.reflectPoint(v, foldLineP1, foldLineP2);
			v.x = reflected.x;
			v.y = reflected.y;
		});

		newMesh.creases = [...mesh.creases, foldLine];
		return newMesh;
	}
};

// SECTION: APPLICATION STATE MANAGEMENT
const AppState = {
	mesh: null,
	history: [],
	historyIndex: -1,
	selectedVertices: [],
	isProcessing: false,
	currentAxiom: 'AXIOM_2',
	isXRayMode: false,
	viewBox: { x: 0, y: 0, width: 0, height: 0 },
	isPanning: false,
	panStartPoint: { x: 0, y: 0 },
	dragOccurred: false,

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
		this.history = [{ mesh: cloneMesh(m), action: 'Initialisation' }];
		this.historyIndex = 0;
		this.selectedVertices = [];
		this.isProcessing = false;
		this.isXRayMode = false;
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
	}
};

// SECTION: UI MANAGEMENT
const UI = {
	elements: {},

	init(controller) {
		this.elements = {
			svg: document.getElementById('origami-svg'),
			foldButton: document.getElementById('fold-button'),
			flipButton: document.getElementById('flip-button'),
			undoButton: document.getElementById('undo-button'),
			redoButton: document.getElementById('redo-button'),
			resetButton: document.getElementById('reset-button'),
			xrayButton: document.getElementById('xray-button'),
			axiomButtons: {
				'AXIOM_1': document.getElementById('axiom1-button'),
				'AXIOM_2': document.getElementById('axiom2-button'),
				'AXIOM_3': document.getElementById('axiom3-button'),
				'AXIOM_4': document.getElementById('axiom4-button'),
				'AXIOM_5': document.getElementById('axiom5-button'),
				'AXIOM_6': document.getElementById('axiom6-button'),
			},
			selectedPointsCountEl: document.getElementById('selected-points-count'),
			requiredPointsCountEl: document.getElementById('required-points-count'),
			faceCountEl: document.getElementById('face-count'),
			vertexCountEl: document.getElementById('vertex-count'),
			historyListEl: document.getElementById('history-list'),
			currentToolNameEl: document.getElementById('current-tool-name'),
			currentToolDescEl: document.getElementById('current-tool-desc')
		};
		
		this.elements.svg.addEventListener('click', (e) => controller.handleSVGClick(e));
		this.elements.svg.addEventListener('mousedown', (e) => controller.handlePanStart(e));
		this.elements.svg.addEventListener('mousemove', (e) => controller.handlePanMove(e));
		this.elements.svg.addEventListener('mouseup', () => controller.handlePanEnd());
		this.elements.svg.addEventListener('mouseleave', () => controller.handlePanEnd());
		this.elements.svg.addEventListener('wheel', (e) => controller.handleZoom(e));

		this.elements.foldButton.addEventListener('click', () => controller.executeFold());
		this.elements.flipButton.addEventListener('click', () => controller.flipPaper());
		this.elements.undoButton.addEventListener('click', () => controller.undo());
		this.elements.redoButton.addEventListener('click', () => controller.redo());
		this.elements.resetButton.addEventListener('click', () => controller.reset());
		this.elements.xrayButton.addEventListener('click', () => controller.toggleXRay());

		Object.keys(this.elements.axiomButtons).forEach(axiomId => {
			const button = this.elements.axiomButtons[axiomId];
			if (button) {
				button.addEventListener('click', () => controller.changeAxiom(axiomId));
			}
		});
	},

	render(state) {
		const { mesh, selectedVertices, currentAxiom, history, historyIndex, isProcessing, isXRayMode, viewBox } = state;

		this.elements.svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
		this.elements.svg.innerHTML = '';
		this.elements.svg.classList.toggle('xray-mode', isXRayMode);

		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		defs.innerHTML = `
			<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
				<polygon points="0 0, 10 3.5, 0 7" fill="${getComputedStyle(document.documentElement).getPropertyValue('--highlight-color')}" />
			</marker>
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
				this.elements.svg.appendChild(line);
			});
		} else {
			mesh.creases.forEach(crease => {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', crease.p1.x); line.setAttribute('y1', crease.p1.y);
				line.setAttribute('x2', crease.p2.x); line.setAttribute('y2', crease.p2.y);
				line.classList.add('crease');
				this.elements.svg.appendChild(line);
			});
		}

		const drawPreviewLine = (p1, p2, className) => {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
			line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
			line.classList.add(className);
			this.elements.svg.appendChild(line);
		};

		const axiomInfo = AXIOMS[currentAxiom];
		if (selectedVertices.length > 0) {
			if ((currentAxiom === 'AXIOM_3' || currentAxiom === 'AXIOM_4' || currentAxiom === 'AXIOM_5') && selectedVertices.length >= 2) {
				drawPreviewLine(selectedVertices[0], selectedVertices[1], 'construction-line');
				if (currentAxiom === 'AXIOM_3' && selectedVertices.length >= 4) {
					drawPreviewLine(selectedVertices[2], selectedVertices[3], 'construction-line');
				} else if (currentAxiom === 'AXIOM_5' && selectedVertices.length >= 4) {
					drawPreviewLine(selectedVertices[2], selectedVertices[3], 'construction-line');
				}
			}
		}

		if (selectedVertices.length === axiomInfo.requiredPoints) {
			const foldLine = axiomInfo.getFoldLine(selectedVertices);
			if (foldLine) {
				drawPreviewLine(foldLine.p1, foldLine.p2, 'preview-line');
				
				let mobilePoint;
				const [p1, p2] = selectedVertices;
				switch (currentAxiom) {
					case 'AXIOM_2': mobilePoint = p1; break;
					case 'AXIOM_3': mobilePoint = p1; break;
					case 'AXIOM_4': mobilePoint = selectedVertices[2]; break;
					case 'AXIOM_5': mobilePoint = p2; break;
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
						this.elements.svg.appendChild(path);
					}
				}
			}
		}

		uniqueEdges.forEach(({ v1, v2 }) => {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', v1.x); line.setAttribute('y1', v1.y);
			line.setAttribute('x2', v2.x); line.setAttribute('y2', v2.y);
			line.setAttribute('data-v1-id', v1.id);
			line.setAttribute('data-v2-id', v2.id);
			line.classList.add('edge-handle');
			this.elements.svg.appendChild(line);
		});

		mesh.vertices.forEach(vertex => {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', vertex.x);
			circle.setAttribute('cy', vertex.y);
			circle.setAttribute('r', 6);
			circle.setAttribute('data-vertex-id', vertex.id);
			circle.classList.add('vertex-handle');
			if (selectedVertices.find(v => v.id === vertex.id)) {
				circle.classList.add('selected');
			}
			this.elements.svg.appendChild(circle);
		});

		this.elements.selectedPointsCountEl.textContent = selectedVertices.length;
		this.elements.requiredPointsCountEl.textContent = axiomInfo.requiredPoints;
		this.elements.faceCountEl.textContent = mesh.faces.length;
		this.elements.vertexCountEl.textContent = mesh.vertices.length;
		this.elements.currentToolNameEl.textContent = axiomInfo.name;
		
		const prompt = axiomInfo.prompts[selectedVertices.length] || axiomInfo.desc;
		this.elements.currentToolDescEl.textContent = prompt;

		this.elements.foldButton.disabled = isProcessing || selectedVertices.length !== axiomInfo.requiredPoints;
		this.elements.flipButton.disabled = isProcessing;
		this.elements.undoButton.disabled = isProcessing || historyIndex <= 0;
		this.elements.redoButton.disabled = isProcessing || historyIndex >= history.length - 1;
		this.elements.resetButton.disabled = isProcessing;
		this.elements.xrayButton.disabled = isProcessing;

		for (const axiomId in this.elements.axiomButtons) {
			this.elements.axiomButtons[axiomId].classList.toggle('active', axiomId === currentAxiom);
		}

		this.elements.historyListEl.innerHTML = '';
		history.slice(1, historyIndex + 1).forEach((histItem, index) => {
			const li = document.createElement('li');
			li.textContent = `${index + 1}: ${histItem.action}`;
			this.elements.historyListEl.appendChild(li);
		});
	}
};

// SECTION: APPLICATION CONTROLLER
const AppController = {
	init() {
		UI.init(this);
		AppState.init();
		UI.render(AppState);
	},

	handlePanStart(event) {
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
	},

	handlePanEnd() {
		AppState.isPanning = false;
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

		UI.elements.svg.setAttribute('viewBox', `${AppState.viewBox.x} ${AppState.viewBox.y} ${AppState.viewBox.width} ${AppState.viewBox.height}`);
	},

	handleSVGClick(event) {
		if (AppState.isProcessing || AppState.dragOccurred) return;
		
		const targetClassList = event.target.classList;

		if (targetClassList.contains('vertex-handle')) {
			const vertexId = event.target.getAttribute('data-vertex-id');
			const vertex = AppState.mesh.vertices.find(v => v.id === vertexId);
			if (vertex) {
				AppState.selectVertex(vertex);
				UI.render(AppState);
			}
		} else if (targetClassList.contains('edge-handle')) {
			const v1Id = event.target.getAttribute('data-v1-id');
			const v2Id = event.target.getAttribute('data-v2-id');
			const v1 = AppState.mesh.vertices.find(v => v.id === v1Id);
			const v2 = AppState.mesh.vertices.find(v => v.id === v2Id);
			if (v1 && v2) {
				AppState.selectVertex(v1, true, v2);
				UI.render(AppState);
			}
		}
	},

	executeFold() {
		const axiom = AXIOMS[AppState.currentAxiom];
		if (AppState.isProcessing || AppState.selectedVertices.length !== axiom.requiredPoints) return;
		
		AppState.isProcessing = true;
		UI.render(AppState);
		
		const foldLine = axiom.getFoldLine(AppState.selectedVertices);
		if (!foldLine) {
			console.error("Impossible de générer la ligne de pli.");
			AppState.isProcessing = false;
			UI.render(AppState);
			return;
		}

		let mobilePoint;
		const [p1, p2, p3, p4] = AppState.selectedVertices;

		switch (AppState.currentAxiom) {
			case 'AXIOM_2':
				mobilePoint = p1;
				break;
			case 'AXIOM_3':
				mobilePoint = p1;
				break;
			case 'AXIOM_4':
				mobilePoint = p3;
				break;
			case 'AXIOM_5':
				mobilePoint = p2;
				break;
			default:
				const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
				const vec = { x: p2.x - p1.x, y: p2.y - p1.y };
				mobilePoint = { x: midPoint.x - vec.y * 0.01, y: midPoint.y + vec.x * 0.01 };
				break;
		}
		
		const newMesh = FoldEngine.performFold(AppState.mesh, foldLine, mobilePoint);
		
		if (newMesh) {
			AppState.mesh = newMesh;
			const action = `Pli ${AXIOMS[AppState.currentAxiom].name}`;
			AppState.history = AppState.history.slice(0, AppState.historyIndex + 1);
			AppState.history.push({ mesh: cloneMesh(AppState.mesh), action: action });
			AppState.historyIndex++;
		}

		AppState.clearSelection();
		AppState.isProcessing = false;
		UI.render(AppState);
	},
	
	toggleXRay() {
		if (AppState.isProcessing) return;
		AppState.isXRayMode = !AppState.isXRayMode;
		UI.render(AppState);
	},

	flipPaper() {
		if (AppState.isProcessing) return;

		if (AppState.mesh.vertices.length > 0) {
			const xCoords = AppState.mesh.vertices.map(v => v.x);
			const minX = Math.min(...xCoords);
			const maxX = Math.max(...xCoords);
			const centerX = (minX + maxX) / 2;

			AppState.mesh.vertices.forEach(vertex => {
				vertex.x = 2 * centerX - vertex.x;
			});
		}

		const maxLayer = AppState.mesh.faces.reduce((max, f) => Math.max(max, f.layer), 0);
		AppState.mesh.faces.forEach(face => {
			face.isRecto = !face.isRecto;
			face.layer = maxLayer - face.layer;
			face.vertices.reverse();
		});
		const action = 'Retourner la feuille';
		AppState.history = AppState.history.slice(0, AppState.historyIndex + 1);
		AppState.history.push({ mesh: cloneMesh(AppState.mesh), action: action });
		AppState.historyIndex++;
		UI.render(AppState);
	},
	
	undo() {
		if (AppState.isProcessing) return;
		AppState.undo();
		AppState.clearSelection();
		UI.render(AppState);
	},

	redo() {
		if (AppState.isProcessing) return;
		AppState.redo();
		AppState.clearSelection();
		UI.render(AppState);
	},

	reset() {
		if (AppState.isProcessing) return;
		AppState.init();
		UI.render(AppState);
	},
	
	changeAxiom(axiomId) {
		if (AppState.isProcessing) return;
		AppState.currentAxiom = axiomId;
		AppState.clearSelection();
		UI.render(AppState);
	}
};

// Start the application
AppController.init();