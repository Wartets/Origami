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
        const newF = new Face(newFaceVertices);
        newF.id = f.id;
        newF.layer = f.layer;
        newF.isRecto = f.isRecto;
        newMesh.faces.push(newF);
    });

    newMesh.creases = oldMesh.creases.map(c => ({
        p1: { x: c.p1.x, y: c.p1.y },
        p2: { x: c.p2.x, y: c.p2.y }
    }));

    return newMesh;
}

const svg = document.getElementById('origami-svg');
const foldButton = document.getElementById('fold-button');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');
const resetButton = document.getElementById('reset-button');
const axiom2Button = document.getElementById('axiom2-button');

const selectedPointsCountEl = document.getElementById('selected-points-count');
const requiredPointsCountEl = document.getElementById('required-points-count');
const faceCountEl = document.getElementById('face-count');
const vertexCountEl = document.getElementById('vertex-count');
const historyListEl = document.getElementById('history-list');
const currentToolNameEl = document.getElementById('current-tool-name');
const currentToolDescEl = document.getElementById('current-tool-desc');

let mesh;
let undoStack = [];
let redoStack = [];
let selectedVertices = [];
let isFolding = false;
let currentAxiom = 'AXIOM_2';

const AXIOM_INFO = {
    'AXIOM_2': {
        name: 'Axiome 2',
        desc: 'Plier un point sur un autre. Sélectionnez deux points.',
        requiredPoints: 2,
    }
};

function saveState() {
    undoStack.push(cloneMesh(mesh));
    redoStack = [];
    updateHistory();
}

function createInitialSquare() {
    const m = new Mesh();
    const size = 300;
    const viewboxWidth = svg.viewBox.baseVal.width || svg.clientWidth;
    const viewboxHeight = svg.viewBox.baseVal.height || svg.clientHeight;
    const centerX = viewboxWidth / 2;
    const centerY = viewboxHeight / 2;

    const v1 = new Vertex(centerX - size / 2, centerY - size / 2);
    const v2 = new Vertex(centerX + size / 2, centerY - size / 2);
    const v3 = new Vertex(centerX + size / 2, centerY + size / 2);
    const v4 = new Vertex(centerX - size / 2, centerY + size / 2);
    m.vertices.push(v1, v2, v3, v4);

    const f1 = new Face([v1, v2, v3, v4]);
    m.faces.push(f1);

    return m;
}

function render() {
    svg.innerHTML = '';

    const facesAndPolygons = mesh.faces.map(face => {
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const pointsString = face.vertices.map(v => `${v.x},${v.y}`).join(' ');
        polygon.setAttribute('points', pointsString);
        polygon.setAttribute('data-face-id', face.id);
        polygon.classList.add(face.isRecto ? 'recto' : 'verso');
        return { face, polygon };
    });

    facesAndPolygons.sort((a, b) => a.face.layer - b.face.layer);
    facesAndPolygons.forEach(({ polygon }) => svg.appendChild(polygon));

    mesh.creases.forEach(crease => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', crease.p1.x);
        line.setAttribute('y1', crease.p1.y);
        line.setAttribute('x2', crease.p2.x);
        line.setAttribute('y2', crease.p2.y);
        line.classList.add('crease');
        svg.appendChild(line);
    });

    const existingVertexIds = new Set(mesh.vertices.map(v => v.id));
    selectedVertices = selectedVertices.filter(v => existingVertexIds.has(v.id));

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
        svg.appendChild(circle);
    });

    updateUI();
}

function updateUI() {
    const requiredPoints = AXIOM_INFO[currentAxiom].requiredPoints;
    selectedPointsCountEl.textContent = selectedVertices.length;
    requiredPointsCountEl.textContent = requiredPoints;
    faceCountEl.textContent = mesh.faces.length;
    vertexCountEl.textContent = mesh.vertices.length;

    currentToolNameEl.textContent = AXIOM_INFO[currentAxiom].name;
    currentToolDescEl.textContent = AXIOM_INFO[currentAxiom].desc;

    foldButton.disabled = isFolding || selectedVertices.length !== requiredPoints;
    undoButton.disabled = isFolding || undoStack.length === 0;
    redoButton.disabled = isFolding || redoStack.length === 0;
    resetButton.disabled = isFolding;
    
    document.querySelectorAll('.tool-button').forEach(btn => {
        btn.classList.remove('active');
        btn.disabled = isFolding;
    });
    if (currentAxiom === 'AXIOM_2') axiom2Button.classList.add('active');
}

function updateHistory() {
    historyListEl.innerHTML = '';
    undoStack.forEach((_, index) => {
        const li = document.createElement('li');
        li.textContent = `Pli ${index + 1}`;
        historyListEl.appendChild(li);
    });
}

function handleSVGClick(event) {
    if (isFolding) return;
    if (event.target.classList.contains('vertex-handle')) {
        const vertexId = event.target.getAttribute('data-vertex-id');
        const vertex = mesh.vertices.find(v => v.id === vertexId);
        
        const index = selectedVertices.findIndex(v => v.id === vertexId);
        const requiredPoints = AXIOM_INFO[currentAxiom].requiredPoints;

        if (index > -1) {
            selectedVertices.splice(index, 1);
        } else if (selectedVertices.length < requiredPoints) {
            selectedVertices.push(vertex);
        }
        render();
    }
}

function getLineSide(p, p1, p2) {
    return (p2.x - p1.x) * (p.y - p1.y) - (p2.y - p1.y) * (p.x - p1.x);
}

function getLineIntersection(p1, p2, p3, p4) {
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(den) < 1e-9) return null;
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= 0 && u <= 1) {
        const newV = new Vertex(p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
        return newV;
    }
    return null;
}

function performFold() {
    if (isFolding || selectedVertices.length !== AXIOM_INFO[currentAxiom].requiredPoints) return;
    
    isFolding = true;
    saveState();
    updateUI();

    const [p1_mobile, p2_static] = selectedVertices;

    // 1. Calculer la ligne de pli (médiatrice du segment [p1_mobile, p2_static])
    const midPoint = new Vertex((p1_mobile.x + p2_static.x) / 2, (p1_mobile.y + p2_static.y) / 2);
    const vec = new Vertex(p2_static.x - p1_mobile.x, p2_static.y - p1_mobile.y);
    const perpendicularVec = new Vertex(-vec.y, vec.x); // Vecteur directeur de la médiatrice
    const foldLineP1 = new Vertex(midPoint.x - perpendicularVec.x, midPoint.y - perpendicularVec.y);
    const foldLineP2 = new Vertex(midPoint.x + perpendicularVec.x, midPoint.y + perpendicularVec.y);
    
    // 2. Déterminer de quel côté de la ligne de pli se trouve le point mobile (p1_mobile)
    // C'est le côté qui sera déplacé.
    const mobileSideSign = getLineSide(p1_mobile, foldLineP1, foldLineP2);
    if (Math.abs(mobileSideSign) < 1e-9) { // Point sur la ligne, pli impossible
        isFolding = false;
        undoStack.pop(); // Annuler le saveState
        updateHistory();
        updateUI();
        return;
    }

    const newFaces = [];
    const newVertices = [];
    const createdVertices = new Map();

    mesh.faces.forEach(face => {
        const poly = face.vertices;
        const polySides = poly.map(p => getLineSide(p, foldLineP1, foldLineP2));

        if (polySides.every(s => s * mobileSideSign >= -1e-9) || polySides.every(s => s * mobileSideSign <= 1e-9)) {
            newFaces.push(face);
            return;
        }

        const mobileHalf = [];
        const staticHalf = [];

        for (let i = 0; i < poly.length; i++) {
            const currentPoint = poly[i];
            const nextPoint = poly[(i + 1) % poly.length];
            const currentSide = polySides[i];
            const nextSide = polySides[(i + 1) % poly.length];

            if (currentSide * mobileSideSign >= -1e-9) {
                mobileHalf.push(currentPoint);
            }
            if (currentSide * mobileSideSign <= 1e-9) {
                staticHalf.push(currentPoint);
            }

            if (currentSide * nextSide < 0) {
                const intersection = getLineIntersection(currentPoint, nextPoint, foldLineP1, foldLineP2);
                if (intersection) {
                    const key = `${intersection.x.toFixed(5)},${intersection.y.toFixed(5)}`;
                    if (!createdVertices.has(key)) {
                        createdVertices.set(key, intersection);
                        newVertices.push(intersection);
                    }
                    const sharedVertex = createdVertices.get(key);
                    mobileHalf.push(sharedVertex);
                    staticHalf.push(sharedVertex);
                }
            }
        }
        
        if (mobileHalf.length > 2) newFaces.push(new Face(mobileHalf, face.layer, face.isRecto));
        if (staticHalf.length > 2) newFaces.push(new Face(staticHalf, face.layer, face.isRecto));
    });

    mesh.faces = newFaces;
    mesh.vertices.push(...newVertices);
    
    const mobileFaces = [];
    mesh.faces.forEach(face => {
        const centroidX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
        const centroidY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
        if (getLineSide({x: centroidX, y: centroidY}, foldLineP1, foldLineP2) * mobileSideSign > 1e-9) {
            mobileFaces.push(face);
        }
    });

    // 3. Appliquer la réflexion à tous les points du côté mobile
    const highestLayer = mesh.faces.length > 0 ? Math.max(...mesh.faces.map(f => f.layer)) : 0;
    
    const A = foldLineP2.y - foldLineP1.y;
    const B = foldLineP1.x - foldLineP2.x;
    const C = -A * foldLineP1.x - B * foldLineP1.y;
    const mobileVertices = new Set();
    mobileFaces.forEach(f => f.vertices.forEach(v => mobileVertices.add(v)));
    
    mobileVertices.forEach(v => {
        const den = A * A + B * B;
        if (den < 1e-9) return;
        const d = 2 * (A * v.x + B * v.y + C) / den;
        v.x -= d * A;
        v.y -= d * B;
    });

    mobileFaces.forEach(face => {
        face.layer = highestLayer + 1;
        face.isRecto = !face.isRecto;
    });
    
    mesh.creases.push({p1: foldLineP1, p2: foldLineP2});
    selectedVertices = [];
    isFolding = false;
    
    render();
}

function undo() {
    if (isFolding || undoStack.length === 0) return;
    redoStack.push(cloneMesh(mesh));
    mesh = undoStack.pop();
    selectedVertices = [];
    render();
    updateHistory();
}

function redo() {
    if (isFolding || redoStack.length === 0) return;
    undoStack.push(cloneMesh(mesh));
    mesh = redoStack.pop();
    selectedVertices = [];
    render();
    updateHistory();
}

function init() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    mesh = createInitialSquare();
    render();
    
    svg.addEventListener('click', handleSVGClick);
    foldButton.addEventListener('click', performFold);
    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);
    resetButton.addEventListener('click', () => {
        if (isFolding) return;
        undoStack = [];
        redoStack = [];
        selectedVertices = [];
        init();
        updateHistory();
    });

    axiom2Button.addEventListener('click', () => {
        currentAxiom = 'AXIOM_2';
        selectedVertices = [];
        render();
    });
}

init();