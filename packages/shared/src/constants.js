"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIVEKIT_CONSTANTS = exports.PAGINATION = exports.JWT_CONSTANTS = exports.RECORDING_CONSTANTS = exports.SESSION_CONSTANTS = void 0;
exports.SESSION_CONSTANTS = {
    MAX_ATTENDEES: 100,
    INVITE_TOKEN_EXPIRY_HOURS: 24,
    SESSION_IDLE_TIMEOUT_MINUTES: 30,
};
exports.RECORDING_CONSTANTS = {
    MAX_DURATION_HOURS: 8,
    SUPPORTED_FORMATS: ['mp4', 'webm'],
    DEFAULT_FORMAT: 'mp4',
    VIDEO_CODEC: 'libx264',
    AUDIO_CODEC: 'aac',
    PIXEL_FORMAT: 'yuv420p',
    FRAME_RATE: 30,
    DEFAULT_RESOLUTION: '1080p',
    FALLBACK_RESOLUTION: '720p',
    RESOLUTION_1080P: {
        width: 1920,
        height: 1080,
    },
    RESOLUTION_720P: {
        width: 1280,
        height: 720,
    },
    PROCESSING_RETRY_ATTEMPTS: 3,
    PROCESSING_RETRY_DELAY_MS: 2000,
};
exports.JWT_CONSTANTS = {
    ACCESS_TOKEN_EXPIRY: '1h',
    REFRESH_TOKEN_EXPIRY: '7d',
    MAGIC_LINK_EXPIRY: '15m',
};
exports.PAGINATION = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
};
exports.LIVEKIT_CONSTANTS = {
    PARTICIPANT_IDENTITY_PREFIX: 'participant_',
    ROOM_NAME_PREFIX: 'session_',
};
//# sourceMappingURL=constants.js.map