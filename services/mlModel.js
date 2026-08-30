/**
 * Explainable machine learning demand model — a linear regression trained
 * by batch gradient descent over cyclical (sin/cos) hour and day-of-week
 * features. No external ML library: the whole algorithm is ~40 lines below,
 * intentionally, so it can be explained line-by-line in a viva/demo.
 *
 * Features per sample: [1 (bias), sin(hourAngle), cos(hourAngle),
 *                        sin(dayAngle), cos(dayAngle), isWeekend]
 * Target: occupancy percentage / 100
 */
class MLDemandModel {
  constructor() {
    this.weights = null;
    this.trained = false;
    this.trainRmse = -1;
  }

  static features(dateStr, hour) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay(); // 0=Sun..6=Sat
    const hourAngle = (2 * Math.PI * hour) / 24;
    const dayAngle = (2 * Math.PI * dayOfWeek) / 7;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    return [1, Math.sin(hourAngle), Math.cos(hourAngle), Math.sin(dayAngle), Math.cos(dayAngle), isWeekend];
  }

  static dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  train(rows) {
    // rows: [{log_date, log_hour, occupancy_pct}, ...]
    if (!rows.length) { this.trained = false; return; }
    const n = rows.length;
    const d = 6;
    const X = rows.map(r => MLDemandModel.features(r.log_date, r.log_hour));
    const y = rows.map(r => r.occupancy_pct / 100);

    let w = new Array(d).fill(0);
    const lr = 0.6;
    const epochs = 1500;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grad = new Array(d).fill(0);
      for (let i = 0; i < n; i++) {
        const pred = MLDemandModel.dot(w, X[i]);
        const err = pred - y[i];
        for (let j = 0; j < d; j++) grad[j] += err * X[i][j];
      }
      for (let j = 0; j < d; j++) w[j] -= (lr * grad[j]) / n;
    }

    let sse = 0;
    for (let i = 0; i < n; i++) {
      const e = MLDemandModel.dot(w, X[i]) - y[i];
      sse += e * e;
    }
    this.weights = w;
    this.trainRmse = Math.sqrt(sse / n) * 100;
    this.trained = true;
  }

  predict(dateStr, hour) {
    if (!this.trained) return 30;
    const f = MLDemandModel.features(dateStr, hour);
    const p = MLDemandModel.dot(this.weights, f) * 100;
    return Math.max(0, Math.min(100, p));
  }

  explain() {
    if (!this.trained) return 'Model not yet trained.';
    const [bias, hourSin, hourCos, daySin, dayCos, weekend] = this.weights;
    return `Linear regression | bias=${bias.toFixed(2)} hourSin=${hourSin.toFixed(2)} hourCos=${hourCos.toFixed(2)} `
      + `daySin=${daySin.toFixed(2)} dayCos=${dayCos.toFixed(2)} weekend=${weekend.toFixed(2)} | training RMSE=${this.trainRmse.toFixed(1)} pts`;
  }
}

module.exports = MLDemandModel;
