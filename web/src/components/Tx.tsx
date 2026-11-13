import { motion } from "motion/react";
import { reader, feeLabel, type TxResult } from "../lib/wallet";
export function TxNote({ tx }: { tx: TxResult | null }) {
  if (!tx) return null;
  return (
    <motion.div className="ok" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <b>Confirmed on Testnet.</b> <span>Network fee: {feeLabel(tx.fee)}</span>
      <a href={reader.txUrl(tx.hash)} target="_blank" rel="noreferrer">View transaction</a>
    </motion.div>
  );
}
