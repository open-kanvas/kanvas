/** Independent wire acceptance inventory for the September 17 work views. */
export const WORK_MAPPING=[
  ['kanvas_start_read','kanvas_inspect','start.read'],
  ['kanvas_session_rename','kanvas_session','rename'],
  ['kanvas_chat_append','kanvas_publish','chat.append'],
  ['kanvas_selection_set','kanvas_control','selection.set'],
] as const;

/** Account receiver operations exercised over both real protocol clients. */
export const DEVICE_MAPPING=[
  ['kanvas_devices_read','kanvas_inspect','devices.read'],
  ['kanvas_participants_read','kanvas_inspect','participants.read'],
  ['kanvas_device_present','kanvas_control','device.present'],
  ['kanvas_device_rename','kanvas_control','device.rename'],
] as const;
