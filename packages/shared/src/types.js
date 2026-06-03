"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = exports.RecordingResolution = exports.RecordingStatus = exports.SessionStatus = exports.UserRole = void 0;
// User types
var UserRole;
(function (UserRole) {
    UserRole["INSTRUCTOR"] = "instructor";
    UserRole["ATTENDEE"] = "attendee";
    UserRole["ADMIN"] = "admin";
})(UserRole || (exports.UserRole = UserRole = {}));
// Session types
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["SCHEDULED"] = "scheduled";
    SessionStatus["LIVE"] = "live";
    SessionStatus["ENDED"] = "ended";
    SessionStatus["CANCELLED"] = "cancelled";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
// Recording types
var RecordingStatus;
(function (RecordingStatus) {
    RecordingStatus["RECORDING_STARTING"] = "recording_starting";
    RecordingStatus["RECORDING_ACTIVE"] = "recording_active";
    RecordingStatus["PROCESSING_QUEUED"] = "processing_queued";
    RecordingStatus["PROCESSING"] = "processing";
    RecordingStatus["READY"] = "ready";
    RecordingStatus["FAILED"] = "failed";
})(RecordingStatus || (exports.RecordingStatus = RecordingStatus = {}));
var RecordingResolution;
(function (RecordingResolution) {
    RecordingResolution["HD_1080P"] = "1080p";
    RecordingResolution["HD_720P"] = "720p";
})(RecordingResolution || (exports.RecordingResolution = RecordingResolution = {}));
// Audit log types
var AuditAction;
(function (AuditAction) {
    AuditAction["RECORDING_START"] = "recording_start";
    AuditAction["RECORDING_STOP"] = "recording_stop";
    AuditAction["RECORDING_PROCESSING_SUCCESS"] = "recording_processing_success";
    AuditAction["RECORDING_PROCESSING_FAILURE"] = "recording_processing_failure";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
//# sourceMappingURL=types.js.map