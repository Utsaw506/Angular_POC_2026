import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AttachmentFileCurrentComponent } from './attachment-file-current.component';

describe('AttachmentFileCurrentComponent', () => {
  let component: AttachmentFileCurrentComponent;
  let fixture: ComponentFixture<AttachmentFileCurrentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttachmentFileCurrentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AttachmentFileCurrentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
