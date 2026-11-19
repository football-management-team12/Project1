// Deliberately memory-only: reload closes verification/reset sessions.
let flow = null;
export const getOtpFlow = () => flow;
export const setOtpFlow = (value) => { flow = value; };
export const clearOtpFlow = () => { flow = null; };
