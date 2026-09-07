export type MatchCandidate = {
  title: string;
  url: string;
  snippet: string;
  platform?: string;
  imageUrl?: string;
  similarityScore?: number | null;
  matchStatus?: "matched" | "no_face" | "unavailable";
};

export function candidateEvidenceFields(candidate: MatchCandidate) {
  return {
    title: candidate.title,
    sourceUrl: candidate.url,
    contentExcerpt: candidate.snippet,
    matchRationale: "Candidate selected for human review",
  };
}

export async function compareCandidateFaces(referenceDescriptor: Float32Array, candidates: MatchCandidate[]): Promise<MatchCandidate[]> {
  return Promise.all(candidates.map(async candidate => {
    if (!candidate.imageUrl) return { ...candidate, similarityScore: null, matchStatus: "unavailable" as const };
    try {
      const faceapi = await import("@vladmandic/face-api");
      const image = await faceapi.fetchImage(candidate.imageUrl);
      const detections = await faceapi.detectAllFaces(image, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
      if (detections.length !== 1) return { ...candidate, similarityScore: null, matchStatus: "no_face" as const };
      const distance = faceapi.euclideanDistance(referenceDescriptor, detections[0].descriptor);
      const similarityScore = Math.round(Math.max(0, Math.min(1, 1 - distance)) * 1000) / 1000;
      return { ...candidate, similarityScore, matchStatus: "matched" as const };
    } catch {
      return { ...candidate, similarityScore: null, matchStatus: "unavailable" as const };
    }
  }));
}
