// Minimal CSR sparse matrix built from COO triplets, with duplicate-index accumulation
// (needed because FEM assembly adds one contribution per element per node pair, and
// shared nodes/edges receive contributions from multiple elements).

export class COOMatrix {
  constructor(n) {
    this.n = n;
    this.rows = [];
    this.cols = [];
    this.vals = [];
  }

  add(i, j, v) {
    if (v === 0) return;
    this.rows.push(i);
    this.cols.push(j);
    this.vals.push(v);
  }

  toCSR() {
    return CSRMatrix.fromCOO(this.n, this.rows, this.cols, this.vals);
  }
}

export class CSRMatrix {
  constructor(n, rowPtr, colIdx, vals) {
    this.n = n;
    this.rowPtr = rowPtr;
    this.colIdx = colIdx;
    this.vals = vals;
  }

  static fromCOO(n, rows, cols, vals) {
    const map = new Map();
    for (let k = 0; k < rows.length; k++) {
      const key = rows[k] * n + cols[k];
      map.set(key, (map.get(key) || 0) + vals[k]);
    }

    const perRow = Array.from({ length: n }, () => []);
    for (const [key, v] of map) {
      const i = Math.floor(key / n);
      const j = key - i * n;
      perRow[i].push([j, v]);
    }

    const rowPtr = new Int32Array(n + 1);
    let nnz = 0;
    for (let i = 0; i < n; i++) {
      perRow[i].sort((a, b) => a[0] - b[0]);
      nnz += perRow[i].length;
      rowPtr[i + 1] = nnz;
    }

    const colIdx = new Int32Array(nnz);
    const vals2 = new Float64Array(nnz);
    let p = 0;
    for (let i = 0; i < n; i++) {
      for (const [j, v] of perRow[i]) {
        colIdx[p] = j;
        vals2[p] = v;
        p++;
      }
    }

    return new CSRMatrix(n, rowPtr, colIdx, vals2);
  }

  matvec(x, out) {
    const { n, rowPtr, colIdx, vals } = this;
    const y = out || new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
        sum += vals[p] * x[colIdx[p]];
      }
      y[i] = sum;
    }
    return y;
  }

  diagonal() {
    const { n, rowPtr, colIdx, vals } = this;
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
        if (colIdx[p] === i) {
          d[i] = vals[p];
          break;
        }
      }
    }
    return d;
  }
}
