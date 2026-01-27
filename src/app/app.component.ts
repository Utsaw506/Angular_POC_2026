import { Component } from '@angular/core';
import { NgIf } from '@angular/common';

import { AttachmentFileEnhancementComponent } from './attachment-file-enhancement/attachment-file-enhancement.component';
import { AttachmentFileCurrentComponent } from './attachment-file-current/attachment-file-current.component';

type PageKey = 'current' | 'enhancement';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, AttachmentFileEnhancementComponent, AttachmentFileCurrentComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  sidebarOpen = false;

  selectedPage: PageKey = 'current';

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  openPage(page: PageKey) {
    this.selectedPage = page;
  }

  get pageTitle(): string {
    return this.selectedPage === 'current'
      ? 'Attachment File Current'
      : 'Attachment File Enhancement';
  }
}
