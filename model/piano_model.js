(function (root, factory) {
  "use strict";
  var model = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = model;
  } else {
    root.PianoModel = model;
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NOTE_COUNT = 88;
  var FIRST_MIDI_NOTE = 21;
  var CONTEXT_LENGTH = 4;
  var FEATURE_COUNT = NOTE_COUNT * CONTEXT_LENGTH;
  var STORAGE_KEY = "piano-88-model-v2";
  var LEARNING_RATE = 0.18;

  function create() {
    return {
      version: 2,
      weights: Array.from({ length: NOTE_COUNT }, function () {
        return Array(FEATURE_COUNT + 1).fill(0);
      }),
      examples: 0,
      history: []
    };
  }

  function isValid(model) {
    return model && model.version === 2 &&
      Array.isArray(model.weights) && model.weights.length === NOTE_COUNT &&
      model.weights.every(function (row) {
        return Array.isArray(row) && row.length === FEATURE_COUNT + 1 &&
          row.every(function (weight) { return Number.isFinite(weight); });
      }) &&
      Array.isArray(model.history) && model.history.length <= 10000 &&
      model.history.every(function (note) {
        return Number.isInteger(note) && note >= 0 && note < NOTE_COUNT;
      }) &&
      Number.isInteger(model.examples) && model.examples >= model.history.length;
  }

  function load() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return { model: create(), warning: false };

      var model = JSON.parse(saved);
      if (isValid(model)) return { model: model, warning: false };
    } catch (error) {
      return { model: create(), warning: true };
    }

    return { model: create(), warning: true };
  }

  function save(model) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
      return true;
    } catch (error) {
      return false;
    }
  }

  function activeFeatures(history) {
    var context = history.slice(-CONTEXT_LENGTH);
    var offset = CONTEXT_LENGTH - context.length;
    var active = context.map(function (note, index) {
      return (offset + index) * NOTE_COUNT + note;
    });
    active.push(FEATURE_COUNT);
    return active;
  }

  function probabilities(model, history) {
    var active = activeFeatures(history);
    var logits = model.weights.map(function (row) {
      return active.reduce(function (sum, index) {
        return sum + row[index];
      }, 0);
    });
    var maxLogit = Math.max.apply(null, logits);
    var scores = logits.map(function (logit) {
      return Math.exp(logit - maxLogit);
    });
    var total = scores.reduce(function (sum, score) { return sum + score; }, 0);
    return scores.map(function (score) { return score / total; });
  }

  function predict(model, history, sharedModel) {
    var personal = probabilities(model, history);
    if (!sharedModel || !sharedModel.examples) return personal;

    var shared = probabilities(sharedModel, history);
    return personal.map(function (score, note) {
      return score * 0.35 + shared[note] * 0.65;
    });
  }

  function learnFromContext(model, history, target) {
    var active = activeFeatures(history);
    var scores = probabilities(model, history);

    model.weights.forEach(function (row, note) {
      var error = scores[note] - (note === target ? 1 : 0);
      active.forEach(function (feature) {
        row[feature] -= LEARNING_RATE * error;
      });
    });
    model.examples++;
  }

  function learn(model, note) {
    learnFromContext(model, model.history, note);
    model.history.push(note);
    if (model.history.length > 10000) model.history.shift();
  }

  function sample(scores) {
    var choice = Math.random();
    var total = 0;
    for (var note = 0; note < scores.length; note++) {
      total += scores[note];
      if (choice <= total) return note;
    }
    return scores.length - 1;
  }

  return {
    create: create,
    isValid: isValid,
    load: load,
    save: save,
    learn: learn,
    learnFromContext: learnFromContext,
    predict: predict,
    sample: sample,
    firstMidiNote: FIRST_MIDI_NOTE,
    noteCount: NOTE_COUNT
  };
}));
