import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  CosplanDetectionBusyError,
  CosplanDetectionTimeoutError,
  detectCosplanSlotCandidates
} from "@/lib/cosplanSlotDetection";
import type { CosplanDetectionPreset } from "@/lib/cosplanTypes";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";

const PRESETS = new Set<CosplanDetectionPreset>(["strict", "standard", "loose"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isTrustedMutationOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as {
    preset?: unknown;
    inset?: unknown;
    assetToken?: unknown;
    layoutVersion?: unknown;
  } | null;
  const preset = body?.preset;
  const inset = Number(body?.inset);
  if (
    typeof preset !== "string" ||
    !PRESETS.has(preset as CosplanDetectionPreset) ||
    !Number.isInteger(inset) ||
    inset < 0 ||
    inset > 64 ||
    typeof body?.assetToken !== "string" ||
    !Number.isInteger(body.layoutVersion)
  ) {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  const template = await prisma.cosplanTemplate.findUnique({
    where: { id },
    select: { assetToken: true, layoutVersion: true, width: true, height: true }
  });
  if (!template) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (template.assetToken !== body.assetToken || template.layoutVersion !== body.layoutVersion) {
    return NextResponse.json({ error: "staleTemplate" }, { status: 409 });
  }
  try {
    const candidates = await detectCosplanSlotCandidates({
      assetToken: template.assetToken,
      width: template.width,
      height: template.height,
      preset: preset as CosplanDetectionPreset,
      inset
    });
    const current = await prisma.cosplanTemplate.findUnique({
      where: { id },
      select: { assetToken: true, layoutVersion: true, width: true, height: true }
    });
    if (
      !current ||
      current.assetToken !== template.assetToken ||
      current.layoutVersion !== template.layoutVersion ||
      current.width !== template.width ||
      current.height !== template.height
    ) {
      return NextResponse.json({ error: "staleTemplate" }, { status: 409 });
    }
    return NextResponse.json({
      candidates,
      assetToken: template.assetToken,
      layoutVersion: template.layoutVersion,
      width: template.width,
      height: template.height
    });
  } catch (error) {
    if (error instanceof CosplanDetectionBusyError) return NextResponse.json({ error: "busy" }, { status: 429 });
    if (error instanceof CosplanDetectionTimeoutError) return NextResponse.json({ error: "timeout" }, { status: 504 });
    return NextResponse.json({ error: "detectionFailed" }, { status: 500 });
  }
}
