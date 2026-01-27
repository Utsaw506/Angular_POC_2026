import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageEditorOldComponent } from './image-editor-old.component';

describe('ImageEditorOldComponent', () => {
  let component: ImageEditorOldComponent;
  let fixture: ComponentFixture<ImageEditorOldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageEditorOldComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImageEditorOldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
