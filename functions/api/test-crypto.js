import { Keypair } from '@stellar/stellar-sdk';

export async function onRequestGet(context) {
  const report = {
    step1_import: "Success",
    step2_keypair_gen: "Pending",
    step3_signing: "Pending",
    runtime_env: typeof EdgeRuntime !== 'undefined' ? 'Edge' : 'Unknown'
  };

  try {
    // Test 1: Keypair Generation
    const tempKp = Keypair.random();
    report.step2_keypair_gen = "Success";
    report.public_key = tempKp.publicKey();

    // Test 2: Signing
    const dataToSign = Buffer.from("verify-crypto-signing");
    const signature = tempKp.sign(dataToSign);
    
    if (signature && signature.length > 0) {
      report.step3_signing = "Success";
      report.signature_base64 = signature.toString('base64');
    }

  } catch (e) {
    return Response.json({
      success: false,
      error: e.message,
      stack: e.stack,
      partial_report: report
    }, { status: 500 });
  }

  return Response.json({ success: true, report });
}