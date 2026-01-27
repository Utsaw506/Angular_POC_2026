import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AttachmentFileEnhancementComponent } from './attachment-file-enhancement.component';

describe('AttachmentFileEnhancementComponent', () => {
  let component: AttachmentFileEnhancementComponent;
  let fixture: ComponentFixture<AttachmentFileEnhancementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttachmentFileEnhancementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AttachmentFileEnhancementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
