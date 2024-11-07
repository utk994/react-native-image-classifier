const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const INPUT_PATH = "input";
const OUTPUT_PATH = "train-images";

const resizeImages = (filePath) => {
  sharp(filePath)
    .resize({ height: 224, width: 224 })
    .toFile(
      `${OUTPUT_PATH}/${filePath.split(".")[0].replace(INPUT_PATH, "")}.jpg`
    );
};

const traverseDirectory = (dir) => {
  fs.readdir(dir, (err, files) => {
    if (err) {
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          return;
        }

        if (stats.isDirectory()) {
          fs.mkdirSync(filePath.replace(INPUT_PATH, OUTPUT_PATH));
          traverseDirectory(filePath);
        } else if (stats.isFile() && /\.(jpg|jpeg|png|gif)$/i.test(file)) {
          resizeImages(filePath);
        }
      });
    });
  });
};

traverseDirectory(INPUT_PATH);
