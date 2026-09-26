import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";
import { T } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Demo" component={Demo} durationInFrames={T.total} fps={60} width={1920} height={1080} defaultProps={{ layout: "wide" as const }} />
    <Composition id="DemoSquare" component={Demo} durationInFrames={T.total} fps={60} width={1080} height={1080} defaultProps={{ layout: "square" as const }} />
  </>
);
