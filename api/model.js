"use strict";

var SharedModel = require("../lib/shared_model");
var PianoModel = require("../model/piano_model");

module.exports = async function (request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    var saved = await SharedModel.readRecord();
    var model = saved ? saved.record.model : PianoModel.create();
    return response.status(200).json({
      version: model.version,
      weights: model.weights,
      examples: model.examples,
      history: [],
      trainedAt: model.trainedAt || null
    });
  } catch (error) {
    console.error("Could not load the shared piano model:", error.message);
    return response.status(503).json({ error: "Shared learning is unavailable." });
  }
};
