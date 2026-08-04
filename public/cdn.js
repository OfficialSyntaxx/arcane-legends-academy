// cdn.js — large 3D models are hosted on the Higgsfield CDN and loaded at runtime (by URL),
// so the deployed `public/` payload stays small (under the ~50MB deploy limit) while the
// world can hold many more models. Local copies live in `models_cdn/` (git-tracked) for the
// repo; the game never ships them in the deploy.
//
// Add a big model here after uploading it (higgsfield_upload) — key = local filename.
export const CDN = {
  "enemy_skeleton.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/2f4d6644-839d-4d77-9233-b58875d9d98a.glb",
  "npc_mage.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/5faf27c0-10bd-47e8-91b9-b3589f43c567.glb",
  "student_gold.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/c9e85b57-1161-49c1-b49d-e246761151d2.glb",
  "student_violet.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/e68a0282-b674-4a9c-8dac-75c4f9f0796d.glb",
  "librarian.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/9b206a5e-2fec-4eaf-8ed0-70c73d28123a.glb",
  "referee.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/dbeadc27-0a03-402c-a143-7ad3bebae124.glb",
  "trainer.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/88d5d371-5c80-40b3-be5e-a9ec4d06e6e0.glb",
  "student_pink.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/69a13d7d-08e3-4db7-9ac3-3a11d7d8c7ff.glb",
  "student_emerald.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/b91c8f77-66cf-4353-892b-870237f61732.glb",
  "player_wizard.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/ce1dae54-c2ac-4834-85a5-a799e41d262f.glb",
  "merchant.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/ad1a304c-d2fa-4de9-b8e1-9c2cf65ba97e.glb",
  "nat_CommonTree_1.glb": "https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/1d74828d-6748-4589-89da-054bf90d13ec.glb",
};

// Return the CDN URL for a model if it's hosted there, else the local path.
export function modelUrl(name) {
  return CDN[name] || ("./assets/models/" + name);
}