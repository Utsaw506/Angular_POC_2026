import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageEditorComponent } from '../shared/image-editor/image-editor.component';

type UserType = 'auditor' | 'auditee';

interface EvidenceSlot {
  slot: number;
  url: string | null;
  caption: string;
  enlarged: boolean;
}

interface StorageModel {
  auditor: EvidenceSlot[];
  auditee: EvidenceSlot[];
}

const STORAGE_KEY = 'ANG18_ATTACHMENT_POC_ENHANCEMENT';

@Component({
  selector: 'app-attachment-file-enhancement',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageEditorComponent],
  templateUrl: './attachment-file-enhancement.component.html',
  styleUrl: './attachment-file-enhancement.component.css'
})
export class AttachmentFileEnhancementComponent {
  tab: 'snapshot' | 'common' = 'snapshot';

  auditorSlots: EvidenceSlot[] = this.createSlots();
  auditeeSlots: EvidenceSlot[] = this.createSlots();

  uploadOpen = false;
  uploadType: UserType = 'auditor';
  uploadSlotNo = 1;
  selectedFile: File | null = null;

  editorOpen = false;
  editorType: UserType = 'auditor';
  editorSlotNo = 1;
  editorImageUrl = '';
  editorCaption = '';
  editorEnlarged = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      this.loadStorage();
    }
  }

  private createSlots(): EvidenceSlot[] {
    return [1, 2, 3, 4].map((slot) => ({
      slot,
      url: null,
      caption: '',
      enlarged: false
    }));
  }

  private getSlots(type: UserType): EvidenceSlot[] {
    return type === 'auditor' ? this.auditorSlots : this.auditeeSlots;
  }

  private setSlot(type: UserType, slotNo: number, patch: Partial<EvidenceSlot>) {
    const list = this.getSlots(type);
    const idx = list.findIndex((x) => x.slot === slotNo);
    if (idx >= 0) list[idx] = { ...list[idx], ...patch };
    this.saveStorage();
  }

  private saveStorage() {
    if (!isPlatformBrowser(this.platformId)) return;

    const model: StorageModel = {
      auditor: this.auditorSlots,
      auditee: this.auditeeSlots
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  }

  private loadStorage() {
    if (!isPlatformBrowser(this.platformId)) return;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const model = JSON.parse(raw) as StorageModel;
      if (model?.auditor?.length) this.auditorSlots = model.auditor;
      if (model?.auditee?.length) this.auditeeSlots = model.auditee;
    } catch {
    }
  }

  resetAll() {
    if (!isPlatformBrowser(this.platformId)) return;

    localStorage.removeItem(STORAGE_KEY);
    this.auditorSlots = this.createSlots();
    this.auditeeSlots = this.createSlots();
  }

  openUpload(type: UserType, slotNo: number) {
    this.uploadType = type;
    this.uploadSlotNo = slotNo;
    this.selectedFile = null;
    this.uploadOpen = true;
  }

  onFilePicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files?.length) return;

    this.selectedFile = input.files[0];
  }

  clearSelectedFile() {
    this.selectedFile = null;
  }

  uploadNow() {
    if (!this.selectedFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.setSlot(this.uploadType, this.uploadSlotNo, {
        url: reader.result as string
      });

      this.uploadOpen = false;
      this.selectedFile = null;
    };
    reader.readAsDataURL(this.selectedFile);
  }

  download(type: UserType, slotNo: number) {
    const slot = this.getSlots(type).find((x) => x.slot === slotNo);
    if (!slot?.url) return;

    const a = document.createElement('a');
    a.href = slot.url;
    a.download = `${type}-snapshot-${slotNo}.png`;
    a.click();
  }

  delete(type: UserType, slotNo: number) {
    this.setSlot(type, slotNo, { url: null, caption: '', enlarged: false });
  }

  openEditor(type: UserType, slotNo: number) {
    const slot = this.getSlots(type).find((x) => x.slot === slotNo);
    if (!slot?.url) return;

    this.editorType = type;
    this.editorSlotNo = slotNo;

    this.editorImageUrl = slot.url;
    this.editorCaption = slot.caption;
    this.editorEnlarged = slot.enlarged;

    this.editorOpen = true;
  }

  onEditorSaved(updated: { url: string; caption: string; enlarged: boolean }) {
    this.setSlot(this.editorType, this.editorSlotNo, {
      url: updated.url,
      caption: updated.caption,
      enlarged: updated.enlarged
    });
    this.editorOpen = false;
  }
}
