import * as THREE from 'three';

// Define the 5 main sectors of the 4:3 image in coordinates x: [-2, 2], y: [-1.5, 1.5]
// Sector 5 is the center heart shape. Sectors 1-4 are the corners meeting the heart.
const HEART_POINTS = [
  { x: 0, y: -0.65 },     // P0: bottom tip
  { x: -0.4, y: -0.25 },   // P1
  { x: -0.75, y: 0.15 },   // P2: left bulge
  { x: -0.75, y: 0.55 },   // P3
  { x: -0.45, y: 0.8 },    // P4: top-left peak
  { x: 0, y: 0.45 },      // P5: center dip
  { x: 0.45, y: 0.8 },     // P6: top-right peak
  { x: 0.75, y: 0.55 },    // P7
  { x: 0.75, y: 0.15 },    // P8: right bulge
  { x: 0.4, y: -0.25 }     // P9
];

// Sector boundaries
const SECTOR_BOUNDS = [
  // Sector 1: Top-Left
  [
    { x: -2, y: 1.5 },
    { x: 0, y: 1.5 },
    HEART_POINTS[5], // P5: (0, 0.45)
    HEART_POINTS[4], // P4: (-0.45, 0.8)
    HEART_POINTS[3], // P3: (-0.75, 0.55)
    HEART_POINTS[2], // P2: (-0.75, 0.15)
    { x: -2, y: 0.15 }
  ],
  // Sector 2: Top-Right
  [
    { x: 0, y: 1.5 },
    { x: 2, y: 1.5 },
    { x: 2, y: 0.15 },
    HEART_POINTS[8], // P8: (0.75, 0.15)
    HEART_POINTS[7], // P7: (0.75, 0.55)
    HEART_POINTS[6], // P6: (0.45, 0.8)
    HEART_POINTS[5]  // P5: (0, 0.45)
  ],
  // Sector 3: Bottom-Left
  [
    { x: -2, y: 0.15 },
    HEART_POINTS[2], // P2: (-0.75, 0.15)
    HEART_POINTS[1], // P1: (-0.4, -0.25)
    HEART_POINTS[0], // P0: (0, -0.65)
    { x: 0, y: -1.5 },
    { x: -2, y: -1.5 }
  ],
  // Sector 4: Bottom-Right
  [
    HEART_POINTS[8], // P8: (0.75, 0.15)
    { x: 2, y: 0.15 },
    { x: 2, y: -1.5 },
    { x: 0, y: -1.5 },
    HEART_POINTS[0], // P0: (0, -0.65)
    HEART_POINTS[9]  // P9: (0.4, -0.25)
  ],
  // Sector 5: Center Heart
  HEART_POINTS
];

// Helper: Calculate polygon centroid
function calculateCentroid(points) {
  let sumX = 0, sumY = 0;
  points.forEach(p => {
    sumX += p.x;
    sumY += p.y;
  });
  return { x: sumX / points.length, y: sumY / points.length };
}

// Helper: Distribute boundary vertices into groups for K pieces
function getSplitGroups(totalVertices, numPieces) {
  const groups = [];
  let currentIdx = 0;
  const base = Math.floor(totalVertices / numPieces);
  const extra = totalVertices % numPieces;
  
  for (let i = 0; i < numPieces; i++) {
    const count = base + (i < extra ? 1 : 0);
    const group = [];
    for (let j = 0; j <= count; j++) {
      group.push((currentIdx + j) % totalVertices);
    }
    groups.push(group);
    currentIdx += count;
  }
  return groups;
}

// Helper: Subdivide a polygon boundary to have exactly targetCount vertices by splitting the longest edges
function subdividePolygon(points, targetCount) {
  const result = points.map(p => ({ x: p.x, y: p.y }));
  while (result.length < targetCount) {
    let longestEdgeIdx = 0;
    let maxDistSq = 0;
    for (let i = 0; i < result.length; i++) {
      const p1 = result[i];
      const p2 = result[(i + 1) % result.length];
      const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        longestEdgeIdx = i;
      }
    }
    
    // Insert midpoint
    const p1 = result[longestEdgeIdx];
    const p2 = result[(longestEdgeIdx + 1) % result.length];
    const midpoint = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
    
    result.splice(longestEdgeIdx + 1, 0, midpoint);
  }
  return result;
}

// Custom UV Projection function to map the global image onto extruded geometries
export function projectGlobalUVs(geometry, offset = { x: 0, y: 0 }) {
  const posAttr = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  
  for (let i = 0; i < posAttr.count; i++) {
    const x_local = posAttr.getX(i);
    const y_local = posAttr.getY(i);
    
    // Restore the original global coordinate of the vertex to calculate global UV
    const x_global = x_local + offset.x;
    const y_global = y_local + offset.y;
    
    // Image boundary is x: [-2, 2] and y: [-1.5, 1.5]
    // Normalized to u: [0, 1] and v: [0, 1]
    const u = (x_global + 2) / 4;
    const v = (y_global + 1.5) / 3;
    
    uvAttr.setXY(i, u, v);
  }
  
  uvAttr.needsUpdate = true;
}

// Generate the puzzle pieces data for a specific stage (0 to 4)
export function getStagePieces(stageIndex) {
  // We want 12 pieces for all stages to make it more complex and fun!
  const numPieces = 12;
  
  const rawBoundaryPoints = SECTOR_BOUNDS[stageIndex];
  const boundaryPoints = subdividePolygon(rawBoundaryPoints, numPieces);
  
  const centroid = calculateCentroid(boundaryPoints);
  const splitGroups = getSplitGroups(boundaryPoints.length, numPieces);
  
  // Define 16 non-overlapping grid slots (8 left gutter, 8 right gutter)
  // Spread out across 4 rows and 2 columns on each side to give maximum spacing
  const slots = [
    { x: -2.6, y: -1.05 }, { x: -2.6, y: -0.35 }, { x: -2.6, y: 0.35 }, { x: -2.6, y: 1.05 },
    { x: -1.65, y: -1.05 }, { x: -1.65, y: -0.35 }, { x: -1.65, y: 0.35 }, { x: -1.65, y: 1.05 },
    
    { x: 1.65, y: -1.05 }, { x: 1.65, y: -0.35 }, { x: 1.65, y: 0.35 }, { x: 1.65, y: 1.05 },
    { x: 2.6, y: -1.05 }, { x: 2.6, y: -0.35 }, { x: 2.6, y: 0.35 }, { x: 2.6, y: 1.05 }
  ];

  // Shuffle the slots to randomize which pieces end up where
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = slots[i];
    slots[i] = slots[j];
    slots[j] = temp;
  }

  const pieces = [];
  
  splitGroups.forEach((group, index) => {
    // Generate piece vertices
    const pieceVertices = [];
    pieceVertices.push(centroid);
    group.forEach(vertexIdx => {
      pieceVertices.push(boundaryPoints[vertexIdx]);
    });
    pieceVertices.push(centroid); // Close the piece path back at centroid
    
    // Create Three.js Shape
    const shape = new THREE.Shape();
    shape.moveTo(pieceVertices[0].x, pieceVertices[0].y);
    for (let i = 1; i < pieceVertices.length; i++) {
      shape.lineTo(pieceVertices[i].x, pieceVertices[i].y);
    }
    
    // Calculate centroid of the piece itself for positioning/explosions
    const pieceCentroid = calculateCentroid(pieceVertices.slice(1, pieceVertices.length - 1));
    
    // Extrude settings for 3D depth
    const extrudeSettings = {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.01,
      bevelSegments: 3,
      curveSegments: 12,
      steps: 1
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Center the geometry origin to the piece's centroid
    // This allows pieces to rotate around their own local centers rather than the scene origin!
    geometry.translate(-pieceCentroid.x, -pieceCentroid.y, 0);
    
    // Project the global UV coords with translation offset
    projectGlobalUVs(geometry, pieceCentroid);
    
    const localTarget = new THREE.Vector3(pieceCentroid.x - centroid.x, pieceCentroid.y - centroid.y, 0);
    const globalTarget = new THREE.Vector3(pieceCentroid.x, pieceCentroid.y, 0);
    
    // Assign piece to one of the shuffled non-overlapping slots, adding a tiny jitter for natural look
    const slot = slots[index];
    const jitterX = (Math.random() - 0.5) * 0.08;
    const jitterY = (Math.random() - 0.5) * 0.08;
    const scatterPos = new THREE.Vector3(slot.x + jitterX, slot.y + jitterY, 0.02);
    
    pieces.push({
      id: `${stageIndex}_${index}`,
      geometry,
      localTargetPos: localTarget,
      globalTargetPos: globalTarget,
      scatterPos: scatterPos,
      scatterRot: new THREE.Euler(
        0, // Keep flat
        0, // Keep flat
        Math.random() * Math.PI * 2 // Completely jumbled 360-degree rotation!
      )
    });
  });
  
  return {
    pieces,
    centroid,
    title: [
      "เสี้ยวความทรงจำที่ 1: ฝั่งซ้ายบน",
      "เสี้ยวความทรงจำที่ 2: ฝั่งขวาบน",
      "เสี้ยวความทรงจำที่ 3: ฝั่งซ้ายล่าง",
      "เสี้ยวความทรงจำที่ 4: ฝั่งขวาล่าง",
      "หัวใจแห่งความทรงจำ: ตรงกลาง"
    ][stageIndex],
    message: [
      "เสี้ยวความทรงจำที่ 1 สำเร็จแล้ว! ภาพเริ่มเป็นรูปเป็นร่างขึ้น...",
      "เสี้ยวความทรงจำที่ 2 สำเร็จแล้ว! ใกล้ความจริงเข้ามาทุกที...",
      "เสี้ยวความทรงจำที่ 3 สำเร็จแล้ว! ชิ้นส่วนที่ขาดหายเริ่มกลับมาครบถ้วน...",
      "เสี้ยวความทรงจำที่ 4 สำเร็จแล้ว! ต่อไปคือด่านสุดท้ายที่สำคัญที่สุด...",
      "ความทรงจำทั้งหมดประกอบเข้าด้วยกันอย่างสมบูรณ์แบบแล้ว! ✨"
    ][stageIndex]
  };
}
