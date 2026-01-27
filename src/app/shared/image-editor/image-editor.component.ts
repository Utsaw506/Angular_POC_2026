import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';

type Tool = 'pen' | 'crop';

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.css'
})
export class ImageEditorComponent {
  @Input() imageUrl = ''; // base64
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{ url: string; caption: string; enlarged: boolean }>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  tool: Tool = 'pen';
  color = '#ff0000';
  width = 4;

  private ctx!: CanvasRenderingContext2D;
  private img = new Image();

  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  // Crop selection
  cropRect: { x: number; y: number; w: number; h: number } | null = null;
  private cropStartX = 0;
  private cropStartY = 0;

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.loadImage();
  }

  private loadImage() {
    this.img = new Image();
    this.img.onload = () => {
      const canvas = this.canvasRef.nativeElement;
      canvas.width = this.img.width;
      canvas.height = this.img.height;

      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.ctx.drawImage(this.img, 0, 0);
    };
    this.img.src = this.imageUrl;
  }

  // ---------------- Toolbar actions ----------------
  setTool(t: Tool) {
    this.tool = t;
    this.cropRect = null;
    this.redraw();
  }

  reset() {
    this.loadImage();
    this.cropRect = null;
    this.tool = 'pen';
  }

  rotate(direction: 'left' | 'right') {
    const canvas = this.canvasRef.nativeElement;

    const temp = document.createElement('canvas');
    const tctx = temp.getContext('2d')!;
    temp.width = canvas.width;
    temp.height = canvas.height;
    tctx.drawImage(canvas, 0, 0);

    const rotated = document.createElement('canvas');
    const rctx = rotated.getContext('2d')!;
    rotated.width = canvas.height;
    rotated.height = canvas.width;

    rctx.translate(rotated.width / 2, rotated.height / 2);
    rctx.rotate((direction === 'left' ? -90 : 90) * Math.PI / 180);
    rctx.drawImage(temp, -canvas.width / 2, -canvas.height / 2);

    canvas.width = rotated.width;
    canvas.height = rotated.height;

    this.ctx = canvas.getContext('2d')!;
    this.ctx.drawImage(rotated, 0, 0);

    // update base image
    const newBase64 = canvas.toDataURL('image/png');
    this.img.src = newBase64;
    this.imageUrl = newBase64;
  }

  // ---------------- Mouse events ----------------
  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    if (this.tool === 'crop') {
      this.cropStartX = x;
      this.cropStartY = y;
      this.cropRect = { x, y, w: 0, h: 0 };
      this.isDrawing = true;
      return;
    }

    this.isDrawing = true;
    this.lastX = x;
    this.lastY = y;
  }

  onMouseMove(ev: MouseEvent) {
    if (!this.isDrawing) return;

    const { x, y } = this.getXY(ev);

    if (this.tool === 'crop') {
      this.cropRect = {
        x: this.cropStartX,
        y: this.cropStartY,
        w: x - this.cropStartX,
        h: y - this.cropStartY
      };
      this.redraw();
      return;
    }

    // Pen draw
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.width;
    this.ctx.lineCap = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  }

  onMouseUp() {
    this.isDrawing = false;
  }

  // ---------------- Crop ----------------
  applyCrop() {
    if (!this.cropRect) return;

    const canvas = this.canvasRef.nativeElement;

    const x = Math.min(this.cropRect.x, this.cropRect.x + this.cropRect.w);
    const y = Math.min(this.cropRect.y, this.cropRect.y + this.cropRect.h);
    const w = Math.abs(this.cropRect.w);
    const h = Math.abs(this.cropRect.h);

    if (w < 5 || h < 5) return;

    const imageData = this.ctx.getImageData(x, y, w, h);

    canvas.width = w;
    canvas.height = h;

    this.ctx = canvas.getContext('2d')!;
    this.ctx.putImageData(imageData, 0, 0);

    const newBase64 = canvas.toDataURL('image/png');
    this.img.src = newBase64;
    this.imageUrl = newBase64;

    this.cropRect = null;
    this.tool = 'pen';
  }

  // ---------------- Save ----------------
  save() {
    const editedBase64 = this.canvasRef.nativeElement.toDataURL('image/png');
    this.saved.emit({
      url: editedBase64,
      caption: this.caption,
      enlarged: this.enlarged
    });
  }

  // ---------------- Helpers ----------------
  private redraw() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.drawImage(this.img, 0, 0);

    // crop box
    if (this.cropRect) {
      this.ctx.save();
      this.ctx.strokeStyle = '#ff0000';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([8, 6]);
      this.ctx.strokeRect(this.cropRect.x, this.cropRect.y, this.cropRect.w, this.cropRect.h);
      this.ctx.restore();
    }
  }

  private getXY(ev: MouseEvent) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY
    };
  }
}
