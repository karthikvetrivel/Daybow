import { Config } from "@remotion/cli/config";

// High quality H.264 for X: near-lossless frames, 60 fps compositions.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(96);
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);
