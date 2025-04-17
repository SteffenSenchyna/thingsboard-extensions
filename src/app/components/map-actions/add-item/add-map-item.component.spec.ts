import { ComponentFixture, TestBed } from "@angular/core/testing";

import { AddMapItemComponent } from "./add-map-item.component";

describe("AddIMaptemComponent", () => {
  let component: AddMapItemComponent;
  let fixture: ComponentFixture<AddMapItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddMapItemComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AddMapItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
