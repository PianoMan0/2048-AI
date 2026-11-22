"use strict";

var blob = require("@vercel/blob");
var PianoModel = require("../model/piano_model");

var MODEL_PATH = "piano/shared-model.json";
var MAX_EXAMPLES_PER_DAY = 50000;
var MAX_REQUEST_IDS = 1600;

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function createRecord(day) {
  return {
    model: PianoModel.create(),
    contributionDate: day,
    dailyExamples: 0,
    recentRequestIds: []
  };
}

function isValidRecord(record) {
  return record && PianoModel.isValid(record.model) &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.contributionDate) &&
    Number.isSafeInteger(record.dailyExamples) &&
    record.dailyExamples >= 0 &&
    record.dailyExamples <= MAX_EXAMPLES_PER_DAY &&
    Array.isArray(record.recentRequestIds) &&
    record.recentRequestIds.length <= MAX_REQUEST_IDS &&
    record.recentRequestIds.every(function (requestId) {
      return typeof requestId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(requestId);
    });
}

async function readRecord() {
  var saved = await blob.get(MODEL_PATH, {
    access: "private",
    useCache: false
  });
  if (!saved) return null;
  if (!saved.stream) throw new Error("Stored shared model has no content.");

  var record = JSON.parse(await new Response(saved.stream).text());
  if (!isValidRecord(record)) throw new Error("Stored shared model is invalid.");

  return { record: record, etag: saved.blob.etag };
}

async function createRecordIfMissing(record) {
  try {
    await blob.put(MODEL_PATH, JSON.stringify(record), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: false
    });
    return true;
  } catch (error) {
    if (await readRecord()) return false;
    throw error;
  }
}

async function saveRecord(record, etag) {
  return blob.put(MODEL_PATH, JSON.stringify(record), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    ifMatch: etag
  });
}

module.exports = {
  createRecord: createRecord,
  createRecordIfMissing: createRecordIfMissing,
  maxExamplesPerDay: MAX_EXAMPLES_PER_DAY,
  readRecord: readRecord,
  saveRecord: saveRecord,
  utcDay: utcDay
};
