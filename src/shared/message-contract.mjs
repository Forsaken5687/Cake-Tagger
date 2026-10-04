export function isFileMessage(event, source, origin, channel, FileClass) {
  return event.source === source && event.origin === origin && !!channel
    && event.data?.channel === channel && event.data.type === 'cake-tagger:files'
    && Array.isArray(event.data.files) && event.data.files.every(file => file instanceof FileClass);
}
