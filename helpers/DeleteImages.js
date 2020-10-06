const fs = require('fs')

const deleteImages = (files, req, res) => {
    files.forEach((value) => {
        try {
            fs.unlinkSync(value)
        } catch (error) {
            res.send(error)
        }
    })
}

module.exports = deleteImages