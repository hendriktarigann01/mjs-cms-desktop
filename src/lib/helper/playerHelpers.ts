// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getActiveSlot = (slots: any[]) => {
  if (!slots || slots.length === 0) return null;

  const now = new Date();

  for (const slot of slots) {
    const slotDate = new Date(slot.slot_date);
    const startTime = new Date(slot.start_time);
    const endTime = new Date(slot.end_time);

    const fullStartTime = new Date(
      slotDate.getFullYear(),
      slotDate.getMonth(),
      slotDate.getDate(),
      startTime.getHours(),
      startTime.getMinutes(),
      startTime.getSeconds()
    );

    const fullEndTime = new Date(
      slotDate.getFullYear(),
      slotDate.getMonth(),
      slotDate.getDate(),
      endTime.getHours(),
      endTime.getMinutes(),
      endTime.getSeconds()
    );

    if (now >= fullStartTime && now < fullEndTime) {
      return slot;
    }
  }

  return null;
};
