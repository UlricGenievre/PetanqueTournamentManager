// Parties de la File System Access API absentes des types DOM standard (Chromium uniquement).

interface FilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showSaveFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
}
