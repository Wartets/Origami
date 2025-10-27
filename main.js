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
    // Détermine de quel côté d'une ligne se trouve un point.
    getLineSide(p, lineP1, lineP2) {
        return (lineP2.x - lineP1.x) * (p.y - lineP1.y) - (lineP2.y - lineP1.y) * (p.x - lineP1.x);
    },

    // Calcule l'intersection entre deux segments de ligne.
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

    // Calcule le point réfléchi par rapport à une ligne.
    reflectPoint(point, lineP1, lineP2) {
        const A = lineP2.y - lineP1.y;
        const B = lineP1.x - lineP2.x;
        const C = -A * lineP1.x - B * lineP1.y;
        const den = A * A + B * B;
        if (den < 1e-9) return new Vertex(point.x, point.y);

        const d = 2 * (A * point.x + B * point.y + C) / den;
        return new Vertex(point.x - d * A, point.y - d * B);
    }
};


// SECTION: AXIOMS CONFIGURATION
const AXIOMS = {
    'AXIOM_2': {
        name: 'Axiome 2',
        desc: 'Plier un point sur un autre.',
        requiredPoints: 2,
        getFoldLine: (points) => {
            const [p1, p2] = points;
            const midPoint = new Vertex((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
            const vec = new Vertex(p2.x - p1.x, p2.y - p1.y);
            const perpendicularVec = new Vertex(-vec.y, vec.x);
            
            const pA = new Vertex(midPoint.x - perpendicularVec.x * 1000, midPoint.y - perpendicularVec.y * 1000);
            const pB = new Vertex(midPoint.x + perpendicularVec.x * 1000, midPoint.y + perpendicularVec.y * 1000);
            return { p1: pA, p2: pB };
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
    undoStack: [],
    redoStack: [],
    selectedVertices: [],
    isProcessing: false,
    currentAxiom: 'AXIOM_2',

    init() {
        const m = new Mesh();
        const size = 300;
        const { width, height } = UI.elements.svg.viewBox.baseVal;
        const centerX = width / 2;
        const centerY = height / 2;

        const v1 = new Vertex(centerX - size / 2, centerY - size / 2);
        const v2 = new Vertex(centerX + size / 2, centerY - size / 2);
        const v3 = new Vertex(centerX + size / 2, centerY + size / 2);
        const v4 = new Vertex(centerX - size / 2, centerY + size / 2);
        m.vertices.push(v1, v2, v3, v4);
        m.faces.push(new Face([v1, v2, v3, v4]));
        
        this.mesh = m;
        this.undoStack = [];
        this.redoStack = [];
        this.selectedVertices = [];
        this.isProcessing = false;
    },

    saveState() {
        this.undoStack.push(cloneMesh(this.mesh));
        this.redoStack = [];
    },

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(cloneMesh(this.mesh));
        this.mesh = this.undoStack.pop();
    },

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(cloneMesh(this.mesh));
        this.mesh = this.redoStack.pop();
    },

    selectVertex(vertex) {
        const requiredPoints = AXIOMS[this.currentAxiom].requiredPoints;
        const index = this.selectedVertices.findIndex(v => v.id === vertex.id);

        if (index > -1) {
            this.selectedVertices.splice(index, 1);
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
            undoButton: document.getElementById('undo-button'),
            redoButton: document.getElementById('redo-button'),
            resetButton: document.getElementById('reset-button'),
            axiom2Button: document.getElementById('axiom2-button'),
            selectedPointsCountEl: document.getElementById('selected-points-count'),
            requiredPointsCountEl: document.getElementById('required-points-count'),
            faceCountEl: document.getElementById('face-count'),
            vertexCountEl: document.getElementById('vertex-count'),
            historyListEl: document.getElementById('history-list'),
            currentToolNameEl: document.getElementById('current-tool-name'),
            currentToolDescEl: document.getElementById('current-tool-desc')
        };
        
        const container = document.getElementById('canvas-container');
        this.elements.svg.setAttribute('viewBox', `0 0 ${container.clientWidth} ${container.clientHeight}`);

        this.elements.svg.addEventListener('click', (e) => controller.handleSVGClick(e));
        this.elements.foldButton.addEventListener('click', () => controller.executeFold());
        this.elements.undoButton.addEventListener('click', () => controller.undo());
        this.elements.redoButton.addEventListener('click', () => controller.redo());
        this.elements.resetButton.addEventListener('click', () => controller.reset());
        this.elements.axiom2Button.addEventListener('click', () => controller.changeAxiom('AXIOM_2'));
    },

    render(state) {
        this.elements.svg.innerHTML = '';
        const { mesh, selectedVertices, currentAxiom, undoStack, redoStack, isProcessing } = state;

        const facesAndPolygons = mesh.faces.map(face => {
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const pointsString = face.vertices.map(v => `${v.x},${v.y}`).join(' ');
            polygon.setAttribute('points', pointsString);
            polygon.setAttribute('data-face-id', face.id);
            polygon.classList.add(face.isRecto ? 'recto' : 'verso');
            return { face, polygon };
        });

        facesAndPolygons.sort((a, b) => a.face.layer - b.face.layer);
        facesAndPolygons.forEach(({ polygon }) => this.elements.svg.appendChild(polygon));

        mesh.creases.forEach(crease => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', crease.p1.x);
            line.setAttribute('y1', crease.p1.y);
            line.setAttribute('x2', crease.p2.x);
            line.setAttribute('y2', crease.p2.y);
            line.classList.add('crease');
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

        const axiomInfo = AXIOMS[currentAxiom];
        this.elements.selectedPointsCountEl.textContent = selectedVertices.length;
        this.elements.requiredPointsCountEl.textContent = axiomInfo.requiredPoints;
        this.elements.faceCountEl.textContent = mesh.faces.length;
        this.elements.vertexCountEl.textContent = mesh.vertices.length;
        this.elements.currentToolNameEl.textContent = axiomInfo.name;
        this.elements.currentToolDescEl.textContent = axiomInfo.desc;

        this.elements.foldButton.disabled = isProcessing || selectedVertices.length !== axiomInfo.requiredPoints;
        this.elements.undoButton.disabled = isProcessing || undoStack.length === 0;
        this.elements.redoButton.disabled = isProcessing || redoStack.length === 0;
        this.elements.resetButton.disabled = isProcessing;

        this.elements.historyListEl.innerHTML = '';
        undoStack.forEach((_, index) => {
            const li = document.createElement('li');
            li.textContent = `Pli ${index + 1}`;
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

    handleSVGClick(event) {
        if (AppState.isProcessing) return;
        if (event.target.classList.contains('vertex-handle')) {
            const vertexId = event.target.getAttribute('data-vertex-id');
            const vertex = AppState.mesh.vertices.find(v => v.id === vertexId);
            if (vertex) {
                AppState.selectVertex(vertex);
                UI.render(AppState);
            }
        }
    },

    executeFold() {
        const axiom = AXIOMS[AppState.currentAxiom];
        if (AppState.isProcessing || AppState.selectedVertices.length !== axiom.requiredPoints) return;
        
        AppState.isProcessing = true;
        UI.render(AppState);
        
        AppState.saveState();
        
        const foldLine = axiom.getFoldLine(AppState.selectedVertices);
        const mobilePoint = AppState.selectedVertices[0];

        const newMesh = FoldEngine.performFold(AppState.mesh, foldLine, mobilePoint);
        
        if (newMesh) {
            AppState.mesh = newMesh;
        } else {
            AppState.undoStack.pop();
        }

        AppState.clearSelection();
        AppState.isProcessing = false;
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