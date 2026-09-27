import {
  PadsCopperMeshBuilder,
  type PadsCopperJob,
  type PadsCopperReply,
} from "./copper-mesh";

// The pool sends only one job at a time to each worker. Clipper and earcut keep
// their existing precision/settings, isolated from other workers and the UI.
self.onmessage = async ({ data }: MessageEvent<PadsCopperJob>) => {
  let reply: PadsCopperReply;
  try {
    const meshes = await new PadsCopperMeshBuilder(data.fill).build();
    reply = { type: "complete", index: data.index, meshes };
    self.postMessage(reply, {
      transfer: PadsCopperMeshBuilder.transfers(meshes),
    });
  } catch (error) {
    reply = {
      type: "error",
      index: data.index,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
    self.postMessage(reply);
  }
};
